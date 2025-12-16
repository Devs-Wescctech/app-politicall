import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  type SurveyTemplate,
  type SurveyCampaign,
  type InsertSurveyCampaign,
  type CustomQuestion,
  type CustomDemographicField,
  insertSurveyCampaignSchema
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Edit, ExternalLink, Copy, CheckCircle, XCircle, Clock, BarChart3, ChevronDown, ChevronUp, Eye, FileText, Calendar, Lock, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import pdfMake from "pdfmake/build/pdfmake";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// Lazy load fonts to avoid bundle size issues
if (typeof window !== 'undefined') {
  import('pdfmake/build/vfs_fonts').then((vfs: any) => {
    (pdfMake as any).vfs = vfs.pdfMake ? vfs.pdfMake.vfs : vfs;
  });
}

const CAMPAIGN_STAGE_CONFIG = {
  aguardando: { 
    label: "Aguardando", 
    iconColor: "text-gray-500 dark:text-gray-400",
    icon: Clock
  },
  aprovado: { 
    label: "Aprovado", 
    iconColor: "text-[#40E0D0]",
    icon: CheckCircle
  },
  em_producao: { 
    label: "Em Produção", 
    iconColor: "text-blue-500",
    icon: BarChart3
  },
  finalizado: { 
    label: "Finalizado", 
    iconColor: "text-green-500",
    icon: CheckCircle
  },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CampaignWithTemplate extends SurveyCampaign {
  template?: SurveyTemplate;
  responseCount?: number;
}


const CHART_COLORS = ["#40E0D0", "#48D1CC", "#5FEDD8", "#76F5E6", "#8DFCF4", "#A4FFF9"];

const DEMOGRAPHIC_LABELS: Record<string, Record<string, string>> = {
  gender: {
    masculino: "Masculino",
    feminino: "Feminino",
    outro: "Outro",
    prefiro_nao_dizer: "Prefiro não dizer"
  },
  ageRange: {
    menos_35: "Menos de 35",
    mais_35: "35 ou mais"
  },
  employmentType: {
    carteira_assinada: "Carteira Assinada",
    autonomo: "Autônomo",
    desempregado: "Desempregado",
    aposentado: "Aposentado",
    outro: "Outro"
  },
  housingType: {
    casa_propria: "Casa Própria",
    aluguel: "Aluguel",
    cedido: "Cedido",
    outro: "Outro"
  },
  hasChildren: {
    sim: "Sim",
    nao: "Não"
  },
  politicalIdeology: {
    direita: "Direita",
    centro: "Centro",
    esquerda: "Esquerda",
    prefiro_nao_comentar: "Prefiro não comentar"
  }
};

async function generateSurveyPdfReport(
  campaign: CampaignWithTemplate,
  template: SurveyTemplate,
  campaignId: string
) {
  try {
    // Ensure fonts are loaded
    if (!(pdfMake as any).vfs) {
      const vfs = await import('pdfmake/build/vfs_fonts');
      (pdfMake as any).vfs = vfs.pdfMake ? vfs.pdfMake.vfs : vfs;
    }

    const response = await apiRequest("GET", `/api/survey-campaigns/${campaignId}/responses`);
    const data = await response.json();
    
    const responses = Array.isArray(data) ? data : (data?.responses || []);
    const groupedResponses = !Array.isArray(data) ? data?.grouped : undefined;
    
    if (responses.length === 0) {
      throw new Error("Nenhuma resposta disponível para gerar o relatório");
    }

    let majorityResult = "";
    let majorityPercentage = "0";
    let totalResponses = responses.length;

    if (template.questionType === "single_choice" || template.questionType === "multiple_choice") {
      const counts: Record<string, number> = {};
      responses.forEach((r: any) => {
        const responseData = r.responseData;
        if (template.questionType === "single_choice" && responseData.answer) {
          counts[responseData.answer] = (counts[responseData.answer] || 0) + 1;
        } else if (template.questionType === "multiple_choice" && responseData.answers) {
          responseData.answers.forEach((ans: string) => {
            counts[ans] = (counts[ans] || 0) + 1;
          });
        }
      });

      const sortedResults = Object.entries(counts)
        .map(([key, value]) => ({
          name: key,
          value,
          percentage: ((value / totalResponses) * 100).toFixed(1)
        }))
        .sort((a, b) => b.value - a.value);

      if (sortedResults.length > 0) {
        majorityResult = sortedResults[0].name;
        majorityPercentage = sortedResults[0].percentage;
      }
    } else if (template.questionType === "open_text" && groupedResponses && groupedResponses.length > 0) {
      majorityResult = groupedResponses[0].displayText;
      majorityPercentage = ((groupedResponses[0].count / totalResponses) * 100).toFixed(1);
    } else if (template.questionType === "rating" && template.options) {
      const avgRatings = template.options.map(option => {
        const ratings = responses
          .map((r: any) => r.responseData?.ratings?.[option])
          .filter((r: any) => r !== undefined);
        const avg = ratings.length > 0
          ? (ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length)
          : 0;
        return { option, avg };
      });
      
      const best = avgRatings.sort((a, b) => b.avg - a.avg)[0];
      if (best) {
        majorityResult = best.option;
        majorityPercentage = ((best.avg / 5) * 100).toFixed(1);
      }
    }

    // Calculate demographic statistics
    const demographicStats = {
      gender: {} as Record<string, number>,
      ageRange: {} as Record<string, number>,
      employmentType: {} as Record<string, number>,
      housingType: {} as Record<string, number>,
      hasChildren: {} as Record<string, number>,
      politicalIdeology: {} as Record<string, number>
    };

    responses.forEach((r: any) => {
      if (r.gender) demographicStats.gender[r.gender] = (demographicStats.gender[r.gender] || 0) + 1;
      if (r.ageRange) demographicStats.ageRange[r.ageRange] = (demographicStats.ageRange[r.ageRange] || 0) + 1;
      if (r.employmentType) demographicStats.employmentType[r.employmentType] = (demographicStats.employmentType[r.employmentType] || 0) + 1;
      if (r.housingType) demographicStats.housingType[r.housingType] = (demographicStats.housingType[r.housingType] || 0) + 1;
      if (r.hasChildren) demographicStats.hasChildren[r.hasChildren] = (demographicStats.hasChildren[r.hasChildren] || 0) + 1;
      if (r.politicalIdeology) demographicStats.politicalIdeology[r.politicalIdeology] = (demographicStats.politicalIdeology[r.politicalIdeology] || 0) + 1;
    });

    const createDemographicTable = (title: string, data: Record<string, number>, labelMap: Record<string, string>) => {
      const tableBody = [
        [
          { text: 'Categoria', style: 'tableHeader', fillColor: '#40E0D0', color: '#FFFFFF' },
          { text: 'Respostas', style: 'tableHeader', fillColor: '#40E0D0', color: '#FFFFFF', alignment: 'center' },
          { text: 'Percentual', style: 'tableHeader', fillColor: '#40E0D0', color: '#FFFFFF', alignment: 'center' }
        ]
      ];

      Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, count]) => {
          const percentage = ((count / totalResponses) * 100).toFixed(1);
          tableBody.push([
            { text: labelMap[key] || key, style: 'tableCell' },
            { text: count.toString(), style: 'tableCell', alignment: 'center' },
            { text: `${percentage}%`, style: 'tableCell', alignment: 'center', color: '#40E0D0', bold: true }
          ]);
        });

      return {
        stack: [
          { text: title, style: 'demographicTitle', margin: [0, 15, 0, 8] },
          {
            table: {
              headerRows: 1,
              widths: ['*', 80, 80],
              body: tableBody
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => '#DDDDDD',
              vLineColor: () => '#DDDDDD',
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 6,
              paddingBottom: () => 6
            }
          }
        ]
      };
    };

    const currentDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [50, 60, 50, 50],
      content: [
        {
          text: 'POLITICALL',
          style: 'header',
          color: '#40E0D0',
          alignment: 'center',
          margin: [0, 0, 0, 8]
        },
        {
          text: 'Relatório de Resultados de Pesquisa',
          style: 'subheader',
          alignment: 'center',
          margin: [0, 0, 0, 20]
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 495,
              y2: 0,
              lineWidth: 2,
              lineColor: '#40E0D0'
            }
          ],
          margin: [0, 0, 0, 25]
        },
        {
          text: 'Informações da Campanha',
          style: 'sectionTitle',
          margin: [0, 0, 0, 12]
        },
        {
          stack: [
            { text: 'Nome da Campanha:', style: 'label' },
            { text: campaign.campaignName, style: 'value', margin: [0, 0, 0, 8] },
            { text: 'Pergunta:', style: 'label' },
            { text: template.questionText, style: 'value', margin: [0, 0, 0, 8] },
            { text: 'Data do Relatório:', style: 'label' },
            { text: currentDate, style: 'value', margin: [0, 0, 0, 8] },
            { text: 'Total de Respostas:', style: 'label' },
            { text: totalResponses.toString(), style: 'value', fontSize: 16, bold: true, color: '#40E0D0' }
          ],
          margin: [0, 0, 0, 30]
        },
        {
          stack: [
            {
              canvas: [
                {
                  type: 'rect',
                  x: 0,
                  y: 0,
                  w: 495,
                  h: 110,
                  r: 6,
                  lineColor: '#40E0D0',
                  lineWidth: 2,
                  color: '#F0FFFF'
                }
              ]
            },
            {
              stack: [
                {
                  text: 'RESULTADO DA MAIORIA',
                  style: 'resultTitle',
                  alignment: 'center',
                  margin: [0, -95, 0, 8]
                },
                {
                  text: majorityResult,
                  style: 'majorityResult',
                  alignment: 'center',
                  margin: [0, 0, 0, 8]
                },
                {
                  text: `${majorityPercentage}%`,
                  style: 'percentage',
                  alignment: 'center',
                  color: '#40E0D0'
                }
              ]
            }
          ],
          margin: [0, 0, 0, 30]
        },
        {
          text: 'Dados Demográficos',
          style: 'sectionTitle',
          pageBreak: 'before',
          margin: [0, 0, 0, 5]
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 495,
              y2: 0,
              lineWidth: 1,
              lineColor: '#40E0D0'
            }
          ],
          margin: [0, 0, 0, 10]
        },
        createDemographicTable('Gênero', demographicStats.gender, DEMOGRAPHIC_LABELS.gender),
        createDemographicTable('Faixa Etária', demographicStats.ageRange, DEMOGRAPHIC_LABELS.ageRange),
        createDemographicTable('Tipo de Emprego', demographicStats.employmentType, DEMOGRAPHIC_LABELS.employmentType),
        createDemographicTable('Tipo de Moradia', demographicStats.housingType, DEMOGRAPHIC_LABELS.housingType),
        createDemographicTable('Possui Filhos', demographicStats.hasChildren, DEMOGRAPHIC_LABELS.hasChildren),
        createDemographicTable('Ideologia Política', demographicStats.politicalIdeology, DEMOGRAPHIC_LABELS.politicalIdeology),
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 495,
              y2: 0,
              lineWidth: 1,
              lineColor: '#CCCCCC'
            }
          ],
          margin: [0, 25, 0, 15]
        },
        {
          text: [
            { text: 'Documento gerado pela plataforma ', style: 'footer' },
            { text: 'Politicall', style: 'footer', bold: true, color: '#40E0D0' },
            { text: ' - www.politicall.com.br', style: 'footer' }
          ],
          alignment: 'center'
        }
      ],
      styles: {
        header: {
          fontSize: 24,
          bold: true,
          letterSpacing: 2
        },
        subheader: {
          fontSize: 13,
          color: '#666666'
        },
        sectionTitle: {
          fontSize: 15,
          bold: true,
          color: '#333333'
        },
        label: {
          fontSize: 9,
          color: '#666666',
          margin: [0, 0, 0, 2]
        },
        value: {
          fontSize: 11,
          color: '#333333'
        },
        resultTitle: {
          fontSize: 12,
          color: '#666666',
          letterSpacing: 1,
          bold: true
        },
        majorityResult: {
          fontSize: 20,
          bold: true,
          color: '#333333'
        },
        percentage: {
          fontSize: 32,
          bold: true
        },
        demographicTitle: {
          fontSize: 12,
          bold: true,
          color: '#40E0D0'
        },
        tableHeader: {
          fontSize: 10,
          bold: true
        },
        tableCell: {
          fontSize: 9,
          color: '#333333'
        },
        footer: {
          fontSize: 9,
          color: '#999999'
        }
      },
      defaultStyle: {
        font: 'Roboto'
      }
    };

    pdfMake.createPdf(docDefinition).download(`resultado-${campaign.slug}.pdf`);
  } catch (error) {
    throw error;
  }
}

interface SurveyResultsProps {
  campaignId: string;
  template?: SurveyTemplate;
  viewCount?: number;
}

interface GroupedTextResponse {
  displayText: string;
  normalizedText: string;
  count: number;
}

interface ResponsesData {
  responses: any[];
  grouped?: GroupedTextResponse[];
  questionType?: string;
}

function SurveyResults({ campaignId, template, viewCount = 0 }: SurveyResultsProps) {
  const { data: responseData, isLoading } = useQuery<ResponsesData>({
    queryKey: ["/api/survey-campaigns", campaignId, "responses"],
    enabled: !!campaignId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Handle both old and new API response formats
  const responses = Array.isArray(responseData) ? responseData : (responseData?.responses || []);
  const groupedResponses = !Array.isArray(responseData) ? responseData?.grouped : undefined;

  if (!responses || responses.length === 0) {
    return (
      <Card className="mt-4 bg-muted/30">
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Nenhuma resposta recebida ainda</p>
        </CardContent>
      </Card>
    );
  }

  // Process demographic data
  const processData = (field: string) => {
    const counts: Record<string, number> = {};
    responses.forEach(r => {
      const value = r[field];
      counts[value] = (counts[value] || 0) + 1;
    });
    return Object.entries(counts).map(([key, value]) => ({
      name: DEMOGRAPHIC_LABELS[field]?.[key] || key,
      value,
      percentage: ((value / responses.length) * 100).toFixed(1)
    }));
  };

  const DEMOGRAPHIC_TITLES: Record<string, string> = {
    gender: "Sexo",
    ageRange: "Faixa Etária",
    employmentType: "Tipo de Trabalho",
    housingType: "Tipo de Moradia",
    hasChildren: "Tem Filhos",
    politicalIdeology: "Ideologia Política"
  };

  // Process survey responses
  const processResponseData = () => {
    if (!template) return [];

    if (template.questionType === "single_choice" || template.questionType === "multiple_choice") {
      const counts: Record<string, number> = {};
      responses.forEach(r => {
        const data = r.responseData;
        if (template.questionType === "single_choice" && data.answer) {
          counts[data.answer] = (counts[data.answer] || 0) + 1;
        } else if (template.questionType === "multiple_choice" && data.answers) {
          data.answers.forEach((ans: string) => {
            counts[ans] = (counts[ans] || 0) + 1;
          });
        }
      });
      return Object.entries(counts).map(([key, value]) => ({
        name: key,
        value,
        percentage: ((value / responses.length) * 100).toFixed(1)
      })).sort((a, b) => b.value - a.value);
    }

    if (template.questionType === "rating" && template.options) {
      return template.options.map(option => {
        const ratings = responses
          .map(r => r.responseData?.ratings?.[option])
          .filter(r => r !== undefined);
        const avg = ratings.length > 0
          ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1)
          : "0.0";
        return { name: option, rating: parseFloat(avg), responses: ratings.length };
      });
    }

    return [];
  };

  const surveyData = processResponseData();

  return (
    <div className="space-y-6 mt-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-[#40E0D0] to-[#48D1CC] text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Visualizações da URL</p>
                <p className="text-4xl font-bold mt-2">{viewCount}</p>
              </div>
              <Eye className="w-12 h-12 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-[#48D1CC] to-[#40E0D0] text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Total de Respostas</p>
                <p className="text-4xl font-bold mt-2">{responses.length}</p>
              </div>
              <BarChart3 className="w-12 h-12 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Survey Responses Chart */}
      {template && (template.questionType === "single_choice" || template.questionType === "multiple_choice") && surveyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Respostas da Pesquisa</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={surveyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} style={{ fontSize: '12px' }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#40E0D0" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Rating Chart */}
      {template && template.questionType === "rating" && surveyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Avaliações Médias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={surveyData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 5]} />
                <YAxis dataKey="name" type="category" width={150} style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="rating" fill="#40E0D0" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Demographic Charts */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Dados Demográficos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.keys(DEMOGRAPHIC_TITLES).map((field) => {
            const data = processData(field);
            return (
              <Card key={field}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{DEMOGRAPHIC_TITLES[field]}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percentage }) => `${name} (${percentage}%)`}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 pt-2 border-t">
                    {data.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="text-muted-foreground">{entry.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.value}</span>
                          <span className="text-muted-foreground">({entry.percentage}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Open Text Responses - Grouped */}
      {template && template.questionType === "open_text" && groupedResponses && groupedResponses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Respostas Abertas Agrupadas ({responses.length} total)</CardTitle>
            <CardDescription>Respostas similares agrupadas e contadas automaticamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {groupedResponses.map((item, idx) => (
                <div key={idx} className="border-l-4 border-[#40E0D0] pl-4 py-2 bg-muted/30 rounded-r">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium flex-1">{item.displayText}</p>
                    <Badge variant="outline" className="shrink-0">
                      {item.count} {item.count === 1 ? 'resposta' : 'respostas'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open Text Responses - Fallback for ungrouped */}
      {template && template.questionType === "open_text" && (!groupedResponses || groupedResponses.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Respostas Abertas ({responses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {responses.map((r, idx) => (
                <div key={idx} className="border-l-4 border-[#40E0D0] pl-4 py-2 bg-muted/30 rounded-r">
                  <p className="text-sm">{r.responseData?.answer || "Sem resposta"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Marketing() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SurveyTemplate | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CampaignWithTemplate | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState<string>("all");
  
  // Ref for scrollable content
  const wizardScrollRef = useRef<HTMLDivElement>(null);
  
  // Scroll to top when wizard step changes
  useEffect(() => {
    if (wizardScrollRef.current) {
      wizardScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [wizardStep]);
  
  // Password protection states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [isValidatingPassword, setIsValidatingPassword] = useState(false);
  const [pendingPdfCampaign, setPendingPdfCampaign] = useState<CampaignWithTemplate | null>(null);
  
  // Distribution type state
  const [distributionType, setDistributionType] = useState<"free" | "google_ads">("free");
  
  // Demographic fields state for free distribution
  const [selectedDemographicFields, setSelectedDemographicFields] = useState<string[]>(["gender", "ageRange", "employmentType", "housingType", "hasChildren", "politicalIdeology"]);
  
  // Custom questions states
  const [isEditingMainQuestion, setIsEditingMainQuestion] = useState(false);
  const [customMainQuestion, setCustomMainQuestion] = useState<string>("");
  const [customMainQuestionType, setCustomMainQuestionType] = useState<"open_text" | "single_choice" | "multiple_choice">("open_text");
  const [customMainQuestionOptions, setCustomMainQuestionOptions] = useState<string[]>([""]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [showAddQuestionDialog, setShowAddQuestionDialog] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<"open_text" | "single_choice" | "multiple_choice">("open_text");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>([""]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // Custom demographic fields states
  const [customDemographicFields, setCustomDemographicFields] = useState<CustomDemographicField[]>([]);
  const [showAddDemographicFieldDialog, setShowAddDemographicFieldDialog] = useState(false);
  const [newDemographicFieldLabel, setNewDemographicFieldLabel] = useState("");
  const [newDemographicFieldType, setNewDemographicFieldType] = useState<"text" | "single_choice" | "multiple_choice">("text");
  const [newDemographicFieldOptions, setNewDemographicFieldOptions] = useState<string[]>(["", ""]);
  const [newDemographicFieldRequired, setNewDemographicFieldRequired] = useState(true);
  const [editingDemographicFieldId, setEditingDemographicFieldId] = useState<string | null>(null);

  const form = useForm<InsertSurveyCampaign>({
    resolver: zodResolver(insertSurveyCampaignSchema),
    defaultValues: {
      templateId: "",
      campaignName: "",
      slug: "",
      status: "under_review",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      targetAudience: null,
      adminReviewerId: null,
      adminNotes: null,
    },
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<SurveyTemplate[]>({
    queryKey: ["/api/survey-templates"],
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<CampaignWithTemplate[]>({
    queryKey: ["/api/survey-campaigns"],
  });

  // Fetch current budget_ads value for display
  const { data: budgetData } = useQuery<{ value: string }>({
    queryKey: ["/api/public/budget-ads"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertSurveyCampaign) => apiRequest("POST", "/api/survey-campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({ title: "Campanha criada com sucesso e enviada para aprovação!" });
      setShowWizard(false);
      setWizardStep(1);
      setSelectedTemplate(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao criar campanha", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertSurveyCampaign> }) => 
      apiRequest("PATCH", `/api/survey-campaigns/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({ title: "Campanha atualizada com sucesso!" });
      setShowWizard(false);
      setWizardStep(1);
      setEditingCampaign(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao atualizar campanha", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/survey-campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/survey-campaigns"] });
      toast({ title: "Campanha removida com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao remover campanha", variant: "destructive" });
    },
  });

  const CUSTOM_TEMPLATE_ID = "custom-template";
  
  const handleTemplateSelect = (templateId: string) => {
    if (templateId === CUSTOM_TEMPLATE_ID) {
      // Custom template - user creates from scratch
      const customTemplate: SurveyTemplate = {
        id: CUSTOM_TEMPLATE_ID,
        name: "Personalizado",
        description: "Crie sua própria pergunta personalizada",
        slug: "personalizado",
        questionText: "",
        questionType: "open_text",
        options: null,
      };
      setSelectedTemplate(customTemplate);
      form.setValue("templateId", CUSTOM_TEMPLATE_ID);
      
      const campaignName = "Pesquisa: Personalizada";
      const generatedSlug = Date.now().toString().slice(-6);
      
      form.setValue("campaignName", campaignName);
      form.setValue("slug", generatedSlug);
      
      // Start with empty custom question in edit mode
      setCustomMainQuestion("");
      setCustomMainQuestionType("open_text");
      setCustomMainQuestionOptions([""]);
      setCustomQuestions([]);
      setIsEditingMainQuestion(true);
      return;
    }
    
    const template = templates?.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      form.setValue("templateId", template.id);
      
      // Auto-generate campaign name and slug based on template
      const campaignName = `Pesquisa: ${template.name}`;
      const generatedSlug = Date.now().toString().slice(-6);
      
      form.setValue("campaignName", campaignName);
      form.setValue("slug", generatedSlug);
      
      // Reset custom questions state
      setCustomMainQuestion(template.questionText);
      setCustomMainQuestionType(template.questionType || "open_text");
      setCustomMainQuestionOptions([""]);
      setCustomQuestions([]);
      setIsEditingMainQuestion(false);
    }
  };

  // Custom questions management functions
  const resetQuestionDialog = () => {
    setNewQuestionText("");
    setNewQuestionType("open_text");
    setNewQuestionOptions([""]);
    setEditingQuestionId(null);
  };

  const handleAddQuestion = () => {
    if (!newQuestionText.trim()) {
      toast({ title: "Digite o texto da pergunta", variant: "destructive" });
      return;
    }

    const newQuestion: CustomQuestion = {
      id: crypto.randomUUID(),
      questionText: newQuestionText.trim(),
      questionType: newQuestionType,
      options: newQuestionType !== "open_text" ? newQuestionOptions.filter(o => o.trim()) : undefined,
      required: true
    };

    if (newQuestionType !== "open_text" && (!newQuestion.options || newQuestion.options.length < 2)) {
      toast({ title: "Adicione pelo menos 2 opções de resposta", variant: "destructive" });
      return;
    }

    if (editingQuestionId) {
      setCustomQuestions(prev => prev.map(q => q.id === editingQuestionId ? { ...newQuestion, id: editingQuestionId } : q));
    } else {
      setCustomQuestions(prev => [...prev, newQuestion]);
    }

    setShowAddQuestionDialog(false);
    resetQuestionDialog();
  };

  const handleEditQuestion = (question: CustomQuestion) => {
    setEditingQuestionId(question.id);
    setNewQuestionText(question.questionText);
    setNewQuestionType(question.questionType);
    setNewQuestionOptions(question.options || [""]);
    setShowAddQuestionDialog(true);
  };

  const handleDeleteQuestion = (questionId: string) => {
    setCustomQuestions(prev => prev.filter(q => q.id !== questionId));
  };

  const addOption = () => {
    setNewQuestionOptions(prev => [...prev, ""]);
  };

  const removeOption = (index: number) => {
    setNewQuestionOptions(prev => prev.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    setNewQuestionOptions(prev => prev.map((opt, i) => i === index ? value : opt));
  };

  // Main question options management
  const addMainQuestionOption = () => {
    setCustomMainQuestionOptions(prev => [...prev, ""]);
  };

  const removeMainQuestionOption = (index: number) => {
    setCustomMainQuestionOptions(prev => prev.filter((_, i) => i !== index));
  };

  const updateMainQuestionOption = (index: number, value: string) => {
    setCustomMainQuestionOptions(prev => prev.map((opt, i) => i === index ? value : opt));
  };

  // Custom demographic field helper functions
  const resetDemographicFieldDialog = () => {
    setNewDemographicFieldLabel("");
    setNewDemographicFieldType("text");
    setNewDemographicFieldOptions(["", ""]);
    setNewDemographicFieldRequired(true);
    setEditingDemographicFieldId(null);
  };

  const handleAddDemographicField = () => {
    if (!newDemographicFieldLabel.trim()) {
      toast({ title: "O nome do campo é obrigatório", variant: "destructive" });
      return;
    }
    
    if (newDemographicFieldType !== "text") {
      const validOptions = newDemographicFieldOptions.filter(o => o.trim());
      if (validOptions.length < 2) {
        toast({ title: "Campos de escolha precisam de pelo menos 2 opções", variant: "destructive" });
        return;
      }
    }

    const newField: CustomDemographicField = {
      id: editingDemographicFieldId || `demo-field-${Date.now()}`,
      label: newDemographicFieldLabel.trim(),
      fieldType: newDemographicFieldType,
      options: newDemographicFieldType !== "text" ? newDemographicFieldOptions.filter(o => o.trim()) : undefined,
      required: newDemographicFieldRequired,
    };

    if (editingDemographicFieldId) {
      setCustomDemographicFields(prev => prev.map(f => f.id === editingDemographicFieldId ? newField : f));
    } else {
      setCustomDemographicFields(prev => [...prev, newField]);
    }

    setShowAddDemographicFieldDialog(false);
    resetDemographicFieldDialog();
  };

  const handleEditDemographicField = (field: CustomDemographicField) => {
    setEditingDemographicFieldId(field.id);
    setNewDemographicFieldLabel(field.label);
    setNewDemographicFieldType(field.fieldType);
    setNewDemographicFieldOptions(field.options || ["", ""]);
    setNewDemographicFieldRequired(field.required);
    setShowAddDemographicFieldDialog(true);
  };

  const handleDeleteDemographicField = (fieldId: string) => {
    setCustomDemographicFields(prev => prev.filter(f => f.id !== fieldId));
  };

  const addDemographicFieldOption = () => {
    setNewDemographicFieldOptions(prev => [...prev, ""]);
  };

  const removeDemographicFieldOption = (index: number) => {
    setNewDemographicFieldOptions(prev => prev.filter((_, i) => i !== index));
  };

  const updateDemographicFieldOption = (index: number, value: string) => {
    setNewDemographicFieldOptions(prev => prev.map((opt, i) => i === index ? value : opt));
  };

  const handleCreateClick = () => {
    setEditingCampaign(null);
    setSelectedTemplate(null);
    setWizardStep(1);
    setCustomMainQuestion("");
    setCustomMainQuestionType("open_text");
    setCustomMainQuestionOptions([""]);
    setCustomQuestions([]);
    setCustomDemographicFields([]);
    setIsEditingMainQuestion(false);
    form.reset({
      templateId: "",
      campaignName: "",
      slug: "",
      status: "under_review",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      region: null,
      targetAudience: null,
      adminReviewerId: null,
      adminNotes: null,
    });
    setShowWizard(true);
  };

  const handleEditClick = (campaign: CampaignWithTemplate) => {
    setEditingCampaign(campaign);
    setSelectedTemplate(campaign.template || null);
    setWizardStep(2);
    
    // Load custom questions if they exist
    const mainQuestion = campaign.customMainQuestion || campaign.template?.questionText || "";
    setCustomMainQuestion(mainQuestion);
    // Load main question type and options from campaign or template
    const mainQuestionType = (campaign as any).customMainQuestionType || campaign.template?.questionType || "open_text";
    setCustomMainQuestionType(mainQuestionType);
    setCustomMainQuestionOptions((campaign as any).customMainQuestionOptions || [""]);
    setCustomQuestions((campaign.customQuestions as CustomQuestion[]) || []);
    setCustomDemographicFields((campaign.customDemographicFields as CustomDemographicField[]) || []);
    setIsEditingMainQuestion(false);
    
    form.reset({
      templateId: campaign.templateId,
      campaignName: campaign.campaignName,
      slug: campaign.slug,
      status: campaign.status,
      startDate: campaign.startDate ? campaign.startDate.toString() : new Date().toISOString(),
      endDate: campaign.endDate ? campaign.endDate.toString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      region: campaign.region,
      targetAudience: campaign.targetAudience,
      adminReviewerId: campaign.adminReviewerId,
      adminNotes: campaign.adminNotes,
    });
    setShowWizard(true);
  };

  const handleDeleteClick = (campaignId: string) => {
    setCampaignToDelete(campaignId);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (campaignToDelete) {
      await deleteMutation.mutateAsync(campaignToDelete);
    }
    setShowDeleteDialog(false);
    setCampaignToDelete(null);
  };

  const handleSubmit = async (data: InsertSurveyCampaign) => {
    // Validate main question options if type requires them
    if (customMainQuestionType !== "open_text") {
      const validOptions = customMainQuestionOptions.filter(o => o.trim());
      if (validOptions.length < 2) {
        toast({ title: "A pergunta principal precisa de pelo menos 2 opções de resposta", variant: "destructive" });
        return;
      }
    }
    
    // Add custom questions data and distribution type
    const submitData = {
      ...data,
      distributionType,
      demographicFields: distributionType === "free" ? selectedDemographicFields : ["gender", "ageRange", "employmentType", "housingType", "hasChildren", "politicalIdeology"],
      customMainQuestion: customMainQuestion !== selectedTemplate?.questionText ? customMainQuestion : null,
      customMainQuestionType: customMainQuestionType !== (selectedTemplate?.questionType || "open_text") ? customMainQuestionType : null,
      customMainQuestionOptions: customMainQuestionType !== "open_text" ? customMainQuestionOptions.filter(o => o.trim()) : null,
      customQuestions: customQuestions.length > 0 ? customQuestions : null,
      customDemographicFields: customDemographicFields.length > 0 ? customDemographicFields : undefined,
    };
    
    if (editingCampaign) {
      await updateMutation.mutateAsync({ id: editingCampaign.id, data: submitData });
    } else {
      await createMutation.mutateAsync(submitData);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "URL copiada para área de transferência!" });
    } catch (error) {
      toast({ title: "Erro ao copiar URL", variant: "destructive" });
    }
  };

  const getLandingPageUrl = (slug: string) => {
    return `https://www.politicall.com.br/pesquisa/${slug}`;
  };

  const toggleResults = (campaignId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId);
    } else {
      newExpanded.add(campaignId);
    }
    setExpandedResults(newExpanded);
  };

  // Password protection for PDF download
  const handlePdfDownload = (campaign: CampaignWithTemplate) => {
    setPendingPdfCampaign(campaign);
    setExportPassword("");
    setIsPasswordDialogOpen(true);
  };

  const validatePasswordAndDownloadPdf = async () => {
    if (!exportPassword.trim()) {
      toast({ title: "Digite a senha do administrador", variant: "destructive" });
      return;
    }

    setIsValidatingPassword(true);
    try {
      const response = await apiRequest("POST", "/api/auth/validate-admin-password", { password: exportPassword });
      const result = await response.json();
      
      if (!response.ok) {
        toast({ 
          title: "Senha incorreta", 
          description: result.error || "A senha do administrador está incorreta.",
          variant: "destructive" 
        });
        return;
      }
      
      if (result.valid && pendingPdfCampaign) {
        setIsPasswordDialogOpen(false);
        setExportPassword("");
        
        // Execute PDF generation
        try {
          if (pendingPdfCampaign.template) {
            await generateSurveyPdfReport(pendingPdfCampaign, pendingPdfCampaign.template, pendingPdfCampaign.id);
            toast({ title: "PDF gerado com sucesso!" });
          }
        } catch (error: any) {
          toast({ 
            title: "Erro ao gerar PDF", 
            description: error.message,
            variant: "destructive" 
          });
        }
        
        setPendingPdfCampaign(null);
      }
    } catch (error: any) {
      toast({ 
        title: "Erro de conexão", 
        description: "Não foi possível validar a senha. Tente novamente.",
        variant: "destructive" 
      });
    } finally {
      setIsValidatingPassword(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            Campanhas de Pesquisa
            {campaigns && campaigns.length > 0 && (
              <Badge variant="secondary" className="text-sm font-normal">
                {campaigns.length}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-2">
            Crie e gerencie pesquisas de opinião pública
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedTemplateFilter}
            onValueChange={setSelectedTemplateFilter}
          >
            <SelectTrigger className="w-[200px] rounded-full" data-testid="select-template-filter">
              <SelectValue placeholder="Filtrar por tema" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os temas</SelectItem>
              {(() => {
                const activeTemplateIds = new Set(campaigns?.map(c => c.templateId) || []);
                const activeTemplates = templates?.filter(t => activeTemplateIds.has(t.id)) || [];
                return activeTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ));
              })()}
            </SelectContent>
          </Select>
          <Button
            onClick={handleCreateClick}
            className="rounded-full"
            data-testid="button-create-campaign"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Campanha
          </Button>
        </div>
      </div>
      <div className="grid lg:grid-cols-1 gap-6">
        {campaignsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : campaigns && campaigns.length > 0 ? (
          (() => {
            const filteredCampaigns = campaigns.filter((campaign) => {
              if (selectedTemplateFilter === "all") return true;
              return campaign.templateId === selectedTemplateFilter;
            });
            
            if (filteredCampaigns.length === 0) {
              return (
                <Card className="text-center py-16">
                  <CardContent className="flex flex-col items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                      <ClipboardList className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Nenhuma campanha encontrada</h3>
                    <p className="text-muted-foreground mb-6 max-w-md text-[12px]">
                      Não há campanhas para o tema selecionado. Selecione outro tema ou crie uma nova campanha.
                    </p>
                    <Button variant="outline" onClick={() => setSelectedTemplateFilter("all")} data-testid="button-clear-filter">
                      Limpar filtro
                    </Button>
                  </CardContent>
                </Card>
              );
            }
            
            return (
              <div className="space-y-4">
                {filteredCampaigns.map((campaign) => {
                  const stageConfig = CAMPAIGN_STAGE_CONFIG[campaign.campaignStage as keyof typeof CAMPAIGN_STAGE_CONFIG] || CAMPAIGN_STAGE_CONFIG.aguardando;
                  const StageIcon = stageConfig.icon;
                  const isApproved = campaign.status === "approved" || campaign.status === "active";
                  const landingUrl = getLandingPageUrl(campaign.slug);

                  return (
                    <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-xs" data-testid={`text-campaign-name-${campaign.id}`}>
                            {campaign.campaignName}
                          </CardTitle>
                          <div className="flex items-center gap-1 text-xs" data-testid={`badge-stage-${campaign.id}`}>
                            <StageIcon className={`w-3 h-3 ${stageConfig.iconColor}`} />
                            <span>{stageConfig.label}</span>
                          </div>
                          {campaign.responseCount !== undefined && (
                            <span className="text-xs text-muted-foreground" data-testid={`badge-responses-${campaign.id}`}>
                              {campaign.responseCount} respostas
                            </span>
                          )}
                        </div>
                        {campaign.template && (
                          <CardDescription className="text-xs" data-testid={`text-template-${campaign.id}`}>
                            Template: {campaign.template.name}
                          </CardDescription>
                        )}
                        {campaign.region && (
                          <CardDescription className="text-xs" data-testid={`text-region-${campaign.id}`}>
                            Região: {campaign.region}
                          </CardDescription>
                        )}
                        {campaign.distributionType === "google_ads" && (
                          <div className="flex items-center gap-2 mt-2">
                            <Calendar className="w-3 h-3 text-[#40E0D0]" />
                            <span className="text-xs text-muted-foreground">
                              {campaign.productionStartDate 
                                ? `${format(new Date(campaign.productionStartDate), "dd/MM/yyyy", { locale: ptBR })} - ${format(addDays(new Date(campaign.productionStartDate), 7), "dd/MM/yyyy", { locale: ptBR })}`
                                : "Datas a definir"
                              }
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-full"
                          onClick={() => handleEditClick(campaign)}
                          data-testid={`button-edit-${campaign.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="rounded-full"
                          onClick={() => handleDeleteClick(campaign.id)}
                          data-testid={`button-delete-${campaign.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isApproved && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">URL da Página de Pesquisa:</Label>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full flex-shrink-0"
                            onClick={() => copyToClipboard(landingUrl)}
                            data-testid={`button-copy-url-${campaign.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full flex-shrink-0"
                            onClick={() => window.open(landingUrl, "_blank")}
                            data-testid={`button-open-url-${campaign.id}`}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full flex-shrink-0"
                            onClick={() => handlePdfDownload(campaign)}
                            data-testid={`button-pdf-${campaign.id}`}
                            title="Baixar Resultado em PDF"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {campaign.targetAudience && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Público-Alvo:</Label>
                        <p className="text-xs text-muted-foreground" data-testid={`text-target-audience-${campaign.id}`}>
                          {campaign.targetAudience}
                        </p>
                      </div>
                    )}

                    {campaign.adminNotes && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Notas do Administrador:</Label>
                        <p className="text-xs text-muted-foreground" data-testid={`text-admin-notes-${campaign.id}`}>
                          {campaign.adminNotes}
                        </p>
                      </div>
                    )}

                    <Separator className="my-4" />

                    <Button
                      variant="outline"
                      className="w-full rounded-full"
                      onClick={() => toggleResults(campaign.id)}
                      data-testid={`button-toggle-results-${campaign.id}`}
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      {expandedResults.has(campaign.id) ? "Ocultar Resultados" : "Ver Resultados da Pesquisa"}
                      {expandedResults.has(campaign.id) ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
                    </Button>

                    {expandedResults.has(campaign.id) && (
                      <SurveyResults campaignId={campaign.id} template={campaign.template} viewCount={campaign.viewCount || 0} />
                    )}
                  </CardContent>
                </Card>
              );
                })}
              </div>
            );
          })()
        ) : (
          <Card className="text-center py-16">
            <CardContent className="flex flex-col items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                <ClipboardList className="w-12 h-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Nenhuma campanha criada</h3>
              <p className="text-muted-foreground mb-6 max-w-md text-[12px]">
                Crie sua primeira pesquisa mercadológica para começar a coletar dados e insights valiosos.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          {/* Fixed Header */}
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b">
            <DialogTitle className="text-2xl">
              {editingCampaign ? "Editar Campanha" : "Pesquisa Mercadológica"}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-4">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    wizardStep === step
                      ? "bg-[#40E0D0] text-white"
                      : wizardStep > step
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {wizardStep > step ? "✓" : step}
                  </div>
                  <div className={`flex-1 h-1 mx-2 ${step < 4 ? (wizardStep > step ? "bg-green-500" : "bg-muted") : "hidden"}`} />
                </div>
              ))}
            </div>
          </DialogHeader>

          {/* Scrollable Content */}
          <div ref={wizardScrollRef} className="flex-1 overflow-y-auto px-6 py-6">
            <Form {...form}>
              {/* Step 1: Selecionar Template */}
              {wizardStep === 1 && !editingCampaign && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Escolha o Tipo de Pesquisa</h3>
                    <p className="text-sm text-muted-foreground">Selecione abaixo o template que melhor se adequa ao objetivo da sua pesquisa</p>
                  </div>

                  <FormField
                    control={form.control}
                    name="templateId"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormControl>
                          <div className="space-y-2">
                            {templatesLoading ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                  <Skeleton key={i} className="h-12 w-full" />
                                ))}
                              </div>
                            ) : templates && templates.length > 0 ? (
                              <>
                                {/* Custom Template Option - First */}
                                <label
                                  className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all hover-elevate ${
                                    field.value === CUSTOM_TEMPLATE_ID ? "border-[#40E0D0] bg-[#40E0D0]/5" : "border-border border-dashed"
                                  }`}
                                  onClick={() => handleTemplateSelect(CUSTOM_TEMPLATE_ID)}
                                  data-testid="radio-template-custom"
                                >
                                  <input
                                    type="radio"
                                    className="w-4 h-4 text-[#40E0D0]"
                                    checked={field.value === CUSTOM_TEMPLATE_ID}
                                    onChange={() => handleTemplateSelect(CUSTOM_TEMPLATE_ID)}
                                  />
                                  <div className="flex-1">
                                    <p className="font-medium flex items-center gap-2">
                                      <Edit className="w-4 h-4 text-[#40E0D0]" />
                                      Personalizado
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-0.5">Crie sua própria pesquisa com perguntas livres</p>
                                  </div>
                                </label>
                                
                                {/* Database Templates (excluding custom-template which is shown above) */}
                                {templates.filter(t => t.id !== CUSTOM_TEMPLATE_ID).map((template) => (
                                  <label
                                    key={template.id}
                                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all hover-elevate ${
                                      field.value === template.id ? "border-[#40E0D0] bg-[#40E0D0]/5" : "border-border"
                                    }`}
                                    onClick={() => handleTemplateSelect(template.id)}
                                    data-testid={`radio-template-${template.id}`}
                                  >
                                    <input
                                      type="radio"
                                      className="w-4 h-4 text-[#40E0D0]"
                                      checked={field.value === template.id}
                                      onChange={() => handleTemplateSelect(template.id)}
                                    />
                                    <div className="flex-1">
                                      <p className="font-medium">{template.name}</p>
                                      {template.description && (
                                        <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>
                                      )}
                                    </div>
                                  </label>
                                ))}
                              </>
                            ) : (
                              <p className="text-center text-muted-foreground py-8">Nenhum template disponível</p>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedTemplate && (
                    <Card className="bg-muted/50">
                      <CardHeader>
                        <CardTitle className="text-base">Preview do Template</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {selectedTemplate.id === CUSTOM_TEMPLATE_ID ? (
                          <div className="text-center py-4">
                            <Edit className="w-8 h-8 mx-auto text-[#40E0D0] mb-2" />
                            <p className="text-sm font-medium">Pesquisa Personalizada</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Você poderá criar suas perguntas na próxima etapa
                            </p>
                          </div>
                        ) : (
                          <>
                            <div>
                              <Label className="text-xs text-muted-foreground">Pergunta Principal:</Label>
                              <p className="text-sm mt-1">{selectedTemplate.questionText}</p>
                            </div>
                            {selectedTemplate.options && selectedTemplate.options.length > 0 && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Opções de Resposta:</Label>
                                <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                                  {selectedTemplate.options.map((option, idx) => (
                                    <li key={idx}>{option}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Step 2: Selecionar Região */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Região da Pesquisa</h3>
                    <p className="text-sm text-muted-foreground">Onde será realizada esta pesquisa mercadológica?</p>
                  </div>

                  <FormField
                    control={form.control}
                    name="region"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Região da Pesquisa *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="Ex: São Paulo - SP, Belo Horizonte - MG, Rio de Janeiro - RJ"
                            data-testid="input-region"
                          />
                        </FormControl>
                        <FormDescription>
                          Especifique a cidade, estado ou região onde a pesquisa será realizada
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Card className="bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-base">Dados Demográficos Coletados</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {distributionType === "free" ? (
                        <>
                          <p className="text-sm text-muted-foreground mb-3">
                            Selecione quais dados demográficos deseja coletar dos participantes:
                          </p>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {[
                              { key: "gender", label: "Gênero" },
                              { key: "ageRange", label: "Faixa etária" },
                              { key: "employmentType", label: "Tipo de emprego" },
                              { key: "housingType", label: "Tipo de moradia" },
                              { key: "hasChildren", label: "Possui filhos" },
                              { key: "politicalIdeology", label: "Ideologia política" },
                            ].map(({ key, label }) => (
                              <div key={key} className="flex items-center gap-2">
                                <Checkbox
                                  id={`demographic-${key}`}
                                  checked={selectedDemographicFields.includes(key)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedDemographicFields([...selectedDemographicFields, key]);
                                    } else {
                                      setSelectedDemographicFields(selectedDemographicFields.filter(f => f !== key));
                                    }
                                  }}
                                  data-testid={`checkbox-demographic-${key}`}
                                />
                                <Label htmlFor={`demographic-${key}`} className="cursor-pointer">{label}</Label>
                              </div>
                            ))}
                          </div>
                          {selectedDemographicFields.length === 0 && (
                            <p className="text-xs text-amber-500 mt-2">
                              Atenção: Nenhum dado demográfico será coletado nesta pesquisa.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground mb-3">
                            Para campanhas com Google Ads, todos os dados demográficos são obrigatórios:
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-start gap-2">
                              <span className="text-[#40E0D0]">•</span>
                              <span>Gênero</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-[#40E0D0]">•</span>
                              <span>Faixa etária</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-[#40E0D0]">•</span>
                              <span>Tipo de emprego</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-[#40E0D0]">•</span>
                              <span>Tipo de moradia</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-[#40E0D0]">•</span>
                              <span>Possui filhos</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-[#40E0D0]">•</span>
                              <span>Ideologia política</span>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Custom Demographic Fields Section - Only for free distribution */}
                  {distributionType === "free" && (
                    <>
                      <Separator />
                      <Card className="border-[#40E0D0]">
                        <CardHeader className="flex flex-row items-center justify-between gap-2">
                          <CardTitle className="text-base text-[#40E0D0]">Campos Demográficos Personalizados</CardTitle>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => {
                              resetDemographicFieldDialog();
                              setShowAddDemographicFieldDialog(true);
                            }}
                            data-testid="button-add-demographic-field"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Adicionar Campo
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Adicione campos personalizados para coletar informações adicionais dos participantes além dos campos predefinidos acima.
                          </p>
                          {customDemographicFields.length > 0 ? (
                            <div className="space-y-2">
                              {customDemographicFields.map((field, index) => (
                                <div
                                  key={field.id}
                                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                                  data-testid={`custom-demographic-field-${index}`}
                                >
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{field.label}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {field.fieldType === "text" ? "Texto livre" : 
                                       field.fieldType === "single_choice" ? "Escolha única" : "Múltipla escolha"}
                                      {field.required ? " • Obrigatório" : " • Opcional"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleEditDemographicField(field)}
                                      data-testid={`button-edit-demographic-field-${index}`}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500"
                                      onClick={() => handleDeleteDemographicField(field.id)}
                                      data-testid={`button-delete-demographic-field-${index}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              Nenhum campo personalizado adicionado.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              )}

              {/* Step 3: Configurar Campanha */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Informações Adicionais</h3>
                    <p className="text-sm text-muted-foreground">O nome e URL da campanha serão gerados automaticamente com base no template escolhido</p>
                  </div>

                  <Card className="bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-base">Dados Gerados Automaticamente</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Nome da Campanha:</Label>
                        <p className="text-sm font-medium mt-1">{form.watch("campaignName")}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">URL da Pesquisa:</Label>
                        <p className="text-sm font-mono mt-1">politicall.com.br/pesquisa/{form.watch("slug")}</p>
                      </div>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          A pesquisa será realizada por <strong>7 dias corridos</strong> a contar da data de aprovação da solicitação
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedTemplate && (
                    <Card className="border-[#40E0D0]">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base text-[#40E0D0]">Perguntas da Pesquisa</CardTitle>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            resetQuestionDialog();
                            setShowAddQuestionDialog(true);
                          }}
                          data-testid="button-add-question"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Adicionar Pergunta
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Main Question */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-[#40E0D0]">PERGUNTA PRINCIPAL:</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setIsEditingMainQuestion(!isEditingMainQuestion)}
                              data-testid="button-edit-main-question"
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              {isEditingMainQuestion ? "Cancelar" : "Editar"}
                            </Button>
                          </div>
                          {isEditingMainQuestion ? (
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label className="text-xs">Texto da Pergunta</Label>
                                <Textarea
                                  value={customMainQuestion}
                                  onChange={(e) => setCustomMainQuestion(e.target.value)}
                                  placeholder="Digite a pergunta principal..."
                                  className="min-h-20"
                                  data-testid="textarea-custom-main-question"
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label className="text-xs">Tipo de Resposta</Label>
                                <Select 
                                  value={customMainQuestionType} 
                                  onValueChange={(value: 'open_text' | 'single_choice' | 'multiple_choice') => setCustomMainQuestionType(value)}
                                >
                                  <SelectTrigger data-testid="select-main-question-type">
                                    <SelectValue placeholder="Selecione o tipo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open_text">Resposta Aberta (texto livre)</SelectItem>
                                    <SelectItem value="single_choice">Escolha Única (uma opção)</SelectItem>
                                    <SelectItem value="multiple_choice">Múltipla Escolha (várias opções)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {(customMainQuestionType === "single_choice" || customMainQuestionType === "multiple_choice") && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Opções de Resposta</Label>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={addMainQuestionOption}
                                      className="h-7 text-xs"
                                      data-testid="button-add-main-option"
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Adicionar Opção
                                    </Button>
                                  </div>
                                  <div className="space-y-2">
                                    {customMainQuestionOptions.map((option, index) => (
                                      <div key={index} className="flex items-center gap-2">
                                        <Input
                                          value={option}
                                          onChange={(e) => updateMainQuestionOption(index, e.target.value)}
                                          placeholder={`Opção ${index + 1}`}
                                          data-testid={`input-main-option-${index}`}
                                        />
                                        {customMainQuestionOptions.length > 2 && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-red-500"
                                            onClick={() => removeMainQuestionOption(index)}
                                            data-testid={`button-remove-main-option-${index}`}
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Mínimo de 2 opções para perguntas de escolha
                                  </p>
                                </div>
                              )}

                              <div className="flex gap-2 pt-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="rounded-full"
                                  onClick={() => setIsEditingMainQuestion(false)}
                                  data-testid="button-save-main-question"
                                >
                                  Salvar
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full"
                                  onClick={() => {
                                    setCustomMainQuestion(selectedTemplate.questionText);
                                    setCustomMainQuestionType(selectedTemplate.questionType || "open_text");
                                    setCustomMainQuestionOptions([""]);
                                    setIsEditingMainQuestion(false);
                                  }}
                                  data-testid="button-reset-main-question"
                                >
                                  Restaurar Original
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white dark:bg-background p-3 rounded-md border">
                              <p className="text-sm font-medium">
                                {customMainQuestion || selectedTemplate.questionText}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Tipo: {customMainQuestionType === "open_text" ? "Resposta Aberta" : 
                                       customMainQuestionType === "single_choice" ? "Escolha Única" : "Múltipla Escolha"}
                              </p>
                              {customMainQuestionType !== "open_text" && customMainQuestionOptions.filter(o => o.trim()).length > 0 && (
                                <ul className="text-xs text-muted-foreground mt-1 ml-4 list-disc">
                                  {customMainQuestionOptions.filter(o => o.trim()).map((opt, i) => (
                                    <li key={i}>{opt}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Custom Questions List */}
                        {customQuestions.length > 0 && (
                          <div className="space-y-2 pt-3 border-t border-[#40E0D0]/30">
                            <Label className="text-xs font-semibold text-[#40E0D0]">PERGUNTAS ADICIONAIS:</Label>
                            <div className="space-y-2">
                              {customQuestions.map((question, index) => (
                                <div key={question.id} className="bg-white dark:bg-background p-3 rounded-md border">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">{index + 1}. {question.questionText}</p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Tipo: {question.questionType === "open_text" ? "Resposta Aberta" : 
                                               question.questionType === "single_choice" ? "Escolha Única" : "Múltipla Escolha"}
                                      </p>
                                      {question.options && question.options.length > 0 && (
                                        <ul className="text-xs text-muted-foreground mt-1 ml-4 list-disc">
                                          {question.options.map((opt, i) => (
                                            <li key={i}>{opt}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleEditQuestion(question)}
                                        data-testid={`button-edit-question-${question.id}`}
                                      >
                                        <Edit className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-600"
                                        onClick={() => handleDeleteQuestion(question.id)}
                                        data-testid={`button-delete-question-${question.id}`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-3 border-t border-[#40E0D0]/30">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            DADOS DEMOGRÁFICOS (coletados automaticamente):
                          </Label>
                          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                            <div className="flex items-center gap-1">
                              <span className="text-[#40E0D0]">✓</span>
                              <span>Gênero</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#40E0D0]">✓</span>
                              <span>Faixa etária</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#40E0D0]">✓</span>
                              <span>Tipo de emprego</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#40E0D0]">✓</span>
                              <span>Tipo de moradia</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#40E0D0]">✓</span>
                              <span>Possui filhos</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#40E0D0]">✓</span>
                              <span>Ideologia política</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <FormField
                    control={form.control}
                    name="targetAudience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações (Opcional)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            placeholder="Adicione observações sobre público-alvo, objetivos ou outras informações relevantes para esta pesquisa..."
                            className="min-h-32"
                            data-testid="textarea-target-audience"
                          />
                        </FormControl>
                        <FormDescription>
                          Essas informações são apenas para controle interno e não serão exibidas publicamente
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Step 4: Revisar e Confirmar */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Revisão e Confirmação</h3>
                    <p className="text-sm text-muted-foreground">Revise os detalhes antes de criar sua campanha</p>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Resumo da Campanha</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Template:</Label>
                        <p className="text-sm font-medium">{selectedTemplate?.name}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Nome:</Label>
                        <p className="text-sm font-medium">{form.watch("campaignName")}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">URL:</Label>
                        <p className="text-sm font-mono">politicall.com.br/pesquisa/{form.watch("slug")}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Região:</Label>
                        <p className="text-sm font-medium">{form.watch("region")}</p>
                      </div>
                      {form.watch("targetAudience") && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Observações:</Label>
                          <p className="text-sm">{form.watch("targetAudience")}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-[#40E0D0]">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-[#40E0D0]" />
                        Tipo de Divulgação *
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <label
                          className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all hover-elevate ${
                            distributionType === "free" ? "border-[#40E0D0] bg-[#40E0D0]/5" : "border-border"
                          }`}
                          onClick={() => setDistributionType("free")}
                          data-testid="radio-distribution-free"
                        >
                          <input
                            type="radio"
                            className="w-4 h-4 text-[#40E0D0]"
                            checked={distributionType === "free"}
                            onChange={() => setDistributionType("free")}
                          />
                          <div className="flex-1">
                            <p className="font-medium">Divulgação Livre</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              Você compartilha o link da pesquisa por conta própria (sem custo adicional)
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-green-600">Grátis</span>
                        </label>
                        
                        <label
                          className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all hover-elevate ${
                            distributionType === "google_ads" ? "border-[#40E0D0] bg-[#40E0D0]/5" : "border-border"
                          }`}
                          onClick={() => setDistributionType("google_ads")}
                          data-testid="radio-distribution-google-ads"
                        >
                          <input
                            type="radio"
                            className="w-4 h-4 text-[#40E0D0]"
                            checked={distributionType === "google_ads"}
                            onChange={() => setDistributionType("google_ads")}
                          />
                          <div className="flex-1">
                            <p className="font-medium">Impulsionar pelo Google ADS</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              Alcance qualificado via tráfego pago com conformidade TSE
                            </p>
                          </div>
                          <span className="text-lg font-bold text-[#40E0D0]">
                            R$ {parseFloat(budgetData?.value || "1250").toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </label>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t">
                        <Label className="text-sm">Prazo de Coleta:</Label>
                        <p className="text-sm font-semibold">7 dias corridos</p>
                      </div>
                      
                      {distributionType === "google_ads" && (
                        <p className="text-xs text-muted-foreground">
                          Valor será cobrado na próxima fatura do seu plano
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30">
                    <CardHeader>
                      <CardTitle className="text-base">Conformidade e Distribuição</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        ✓ Esta campanha está em <strong>conformidade com as diretrizes do TSE</strong> (Tribunal Superior Eleitoral)
                      </p>
                      {distributionType === "google_ads" ? (
                        <>
                          <p>
                            ✓ Respeita as <strong>políticas de tráfego pago do Google Ads</strong>
                          </p>
                          <p className="text-xs text-muted-foreground mt-3">
                            As respostas serão coletadas através de distribuição paga no Google Ads, 
                            garantindo alcance qualificado e conformidade com todas as regulamentações aplicáveis.
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-3">
                          Você receberá um link para compartilhar a pesquisa por seus próprios canais (WhatsApp, redes sociais, email, etc).
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </Form>
          </div>

          {/* Fixed Footer */}
          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t">
            <div className="flex items-center gap-3 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (wizardStep === 1) {
                    setShowWizard(false);
                    setWizardStep(1);
                  } else {
                    setWizardStep(wizardStep - 1);
                  }
                }}
                className="rounded-full flex-1"
                data-testid="button-wizard-back"
              >
                {wizardStep === 1 ? "Cancelar" : "Voltar"}
              </Button>

              <Button
                type="button"
                onClick={async () => {
                  if (wizardStep === 1) {
                    const isValid = await form.trigger("templateId");
                    if (isValid && form.watch("templateId")) {
                      setWizardStep(2);
                    }
                  } else if (wizardStep === 2) {
                    const isValid = await form.trigger("region");
                    if (isValid && form.watch("region")) {
                      setWizardStep(3);
                    }
                  } else if (wizardStep === 3) {
                    // Step 3 has no required fields, just move to step 4
                    setWizardStep(4);
                  } else if (wizardStep === 4) {
                    form.handleSubmit(handleSubmit)();
                  }
                }}
                disabled={
                  (wizardStep === 1 && !form.watch("templateId")) ||
                  (wizardStep === 2 && !form.watch("region")) ||
                  (wizardStep === 4 && (createMutation.isPending || updateMutation.isPending))
                }
                className="rounded-full bg-[#40E0D0] hover:bg-[#48D1CC] text-white flex-1"
                data-testid="button-wizard-next"
              >
                {wizardStep === 4
                  ? createMutation.isPending || updateMutation.isPending
                    ? "Criando..."
                    : editingCampaign
                    ? "Atualizar Campanha"
                    : "Criar e Enviar para Aprovação"
                  : "Próximo"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" data-testid="button-cancel-delete">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="rounded-full bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Password Confirmation Dialog for PDF Download */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
        setIsPasswordDialogOpen(open);
        if (!open) {
          setExportPassword("");
          setPendingPdfCampaign(null);
        }
      }}>
        <DialogContent className="max-w-sm p-0" aria-describedby="password-dialog-description">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Confirmação de Segurança
            </DialogTitle>
            <p id="password-dialog-description" className="text-xs text-muted-foreground mt-1">
              Digite a senha do administrador da conta para autorizar o download do relatório
            </p>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Senha do Administrador</label>
              <Input
                type="password"
                placeholder="Digite a senha"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    validatePasswordAndDownloadPdf();
                  }
                }}
                data-testid="input-pdf-password"
              />
              <p className="text-xs text-muted-foreground">
                Somente o administrador ou usuários autorizados podem baixar relatórios
              </p>
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsPasswordDialogOpen(false);
                setExportPassword("");
                setPendingPdfCampaign(null);
              }}
              className="flex-1"
              data-testid="button-cancel-pdf"
            >
              Cancelar
            </Button>
            <Button
              onClick={validatePasswordAndDownloadPdf}
              disabled={isValidatingPassword || !exportPassword.trim()}
              className="flex-1"
              data-testid="button-confirm-pdf"
            >
              {isValidatingPassword ? "Validando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Add/Edit Question Dialog */}
      <Dialog open={showAddQuestionDialog} onOpenChange={(open) => {
        setShowAddQuestionDialog(open);
        if (!open) resetQuestionDialog();
      }}>
        <DialogContent className="max-w-lg" aria-describedby="add-question-description">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingQuestionId ? "Editar Pergunta" : "Adicionar Nova Pergunta"}
            </DialogTitle>
            <p id="add-question-description" className="text-sm text-muted-foreground">
              Configure os detalhes da pergunta adicional para sua pesquisa
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Texto da Pergunta *</Label>
              <Textarea
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                placeholder="Digite a pergunta..."
                className="min-h-20"
                data-testid="textarea-new-question"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Resposta *</Label>
              <Select 
                value={newQuestionType} 
                onValueChange={(value: 'open_text' | 'single_choice' | 'multiple_choice') => setNewQuestionType(value)}
              >
                <SelectTrigger data-testid="select-question-type">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open_text">Resposta Aberta (texto livre)</SelectItem>
                  <SelectItem value="single_choice">Escolha Única (uma opção)</SelectItem>
                  <SelectItem value="multiple_choice">Múltipla Escolha (várias opções)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newQuestionType === "single_choice" || newQuestionType === "multiple_choice") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Opções de Resposta *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOption}
                    className="h-7 text-xs"
                    data-testid="button-add-option"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar Opção
                  </Button>
                </div>
                <div className="space-y-2">
                  {newQuestionOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        placeholder={`Opção ${index + 1}`}
                        data-testid={`input-option-${index}`}
                      />
                      {newQuestionOptions.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => removeOption(index)}
                          data-testid={`button-remove-option-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo de 2 opções para perguntas de escolha
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddQuestionDialog(false);
                resetQuestionDialog();
              }}
              className="rounded-full"
              data-testid="button-cancel-question"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddQuestion}
              className="rounded-full bg-[#40E0D0] hover:bg-[#48D1CC] text-white"
              data-testid="button-save-question"
            >
              {editingQuestionId ? "Salvar Alterações" : "Adicionar Pergunta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Custom Demographic Field Dialog */}
      <Dialog open={showAddDemographicFieldDialog} onOpenChange={(open) => {
        setShowAddDemographicFieldDialog(open);
        if (!open) resetDemographicFieldDialog();
      }}>
        <DialogContent className="max-w-lg" aria-describedby="add-demographic-field-description">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingDemographicFieldId ? "Editar Campo Demográfico" : "Adicionar Campo Demográfico"}
            </DialogTitle>
            <p id="add-demographic-field-description" className="text-sm text-muted-foreground">
              Configure os detalhes do campo demográfico personalizado
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Campo *</Label>
              <Input
                value={newDemographicFieldLabel}
                onChange={(e) => setNewDemographicFieldLabel(e.target.value)}
                placeholder="Ex: Bairro, Profissão, Escolaridade..."
                data-testid="input-demographic-field-label"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Resposta *</Label>
              <Select 
                value={newDemographicFieldType} 
                onValueChange={(value: 'text' | 'single_choice' | 'multiple_choice') => setNewDemographicFieldType(value)}
              >
                <SelectTrigger data-testid="select-demographic-field-type">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto Livre</SelectItem>
                  <SelectItem value="single_choice">Escolha Única</SelectItem>
                  <SelectItem value="multiple_choice">Múltipla Escolha</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newDemographicFieldType === "single_choice" || newDemographicFieldType === "multiple_choice") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Opções de Resposta *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addDemographicFieldOption}
                    className="h-7 text-xs"
                    data-testid="button-add-demographic-option"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar Opção
                  </Button>
                </div>
                <div className="space-y-2">
                  {newDemographicFieldOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option}
                        onChange={(e) => updateDemographicFieldOption(index, e.target.value)}
                        placeholder={`Opção ${index + 1}`}
                        data-testid={`input-demographic-option-${index}`}
                      />
                      {newDemographicFieldOptions.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => removeDemographicFieldOption(index)}
                          data-testid={`button-remove-demographic-option-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo de 2 opções para campos de escolha
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="demographic-field-required"
                checked={newDemographicFieldRequired}
                onCheckedChange={(checked) => setNewDemographicFieldRequired(checked === true)}
                data-testid="checkbox-demographic-field-required"
              />
              <Label htmlFor="demographic-field-required" className="cursor-pointer">
                Campo obrigatório
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDemographicFieldDialog(false);
                resetDemographicFieldDialog();
              }}
              className="rounded-full"
              data-testid="button-cancel-demographic-field"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddDemographicField}
              className="rounded-full bg-[#40E0D0] hover:bg-[#48D1CC] text-white"
              data-testid="button-save-demographic-field"
            >
              {editingDemographicFieldId ? "Salvar Alterações" : "Adicionar Campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
