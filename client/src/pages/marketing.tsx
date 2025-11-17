import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  type SurveyTemplate,
  type SurveyCampaign,
  type InsertSurveyCampaign,
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Edit, ExternalLink, Copy, CheckCircle, XCircle, Clock, BarChart3, ChevronDown, ChevronUp, Eye, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import pdfMake from "pdfmake/build/pdfmake";

// Lazy load fonts to avoid bundle size issues
if (typeof window !== 'undefined') {
  import('pdfmake/build/vfs_fonts').then((vfs: any) => {
    (pdfMake as any).vfs = vfs.pdfMake ? vfs.pdfMake.vfs : vfs;
  });
}

const SURVEY_STATUS_CONFIG = {
  under_review: { 
    label: "Em Análise", 
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: Clock
  },
  approved: { 
    label: "Aprovado", 
    color: "bg-[#40E0D0] text-white dark:bg-[#48D1CC] dark:text-gray-900",
    icon: CheckCircle
  },
  rejected: { 
    label: "Rejeitado", 
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: XCircle
  },
  active: { 
    label: "Ativo", 
    color: "bg-[#40E0D0] text-white dark:bg-[#48D1CC] dark:text-gray-900",
    icon: CheckCircle
  },
  paused: { 
    label: "Pausado", 
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    icon: Clock
  },
  completed: { 
    label: "Concluído", 
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
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

  const handleTemplateSelect = (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      form.setValue("templateId", template.id);
      
      // Auto-generate campaign name and slug based on template
      const campaignName = `Pesquisa: ${template.name}`;
      const generatedSlug = slugify(template.slug + "-" + Date.now().toString().slice(-6));
      
      form.setValue("campaignName", campaignName);
      form.setValue("slug", generatedSlug);
    }
  };

  const handleCreateClick = () => {
    setEditingCampaign(null);
    setSelectedTemplate(null);
    setWizardStep(1);
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
    if (editingCampaign) {
      await updateMutation.mutateAsync({ id: editingCampaign.id, data });
    } else {
      await createMutation.mutateAsync(data);
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

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Campanhas de Pesquisa</h1>
          <p className="text-muted-foreground mt-2">
            Crie e gerencie pesquisas de opinião pública
          </p>
        </div>
        <Button
          onClick={handleCreateClick}
          className="rounded-full"
          data-testid="button-create-campaign"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      <div className="grid lg:grid-cols-1 gap-6">
        {campaignsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : campaigns && campaigns.length > 0 ? (
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const statusConfig = SURVEY_STATUS_CONFIG[campaign.status as keyof typeof SURVEY_STATUS_CONFIG];
              const StatusIcon = statusConfig.icon;
              const isApproved = campaign.status === "approved" || campaign.status === "active";
              const landingUrl = getLandingPageUrl(campaign.slug);

              return (
                <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-xl" data-testid={`text-campaign-name-${campaign.id}`}>
                            {campaign.campaignName}
                          </CardTitle>
                          <div className="flex items-center gap-1 text-sm" data-testid={`badge-status-${campaign.id}`}>
                            <StatusIcon className="w-3 h-3" />
                            <span>{statusConfig.label}</span>
                          </div>
                          {campaign.responseCount !== undefined && (
                            <span className="text-sm text-muted-foreground" data-testid={`badge-responses-${campaign.id}`}>
                              {campaign.responseCount} respostas
                            </span>
                          )}
                        </div>
                        {campaign.template && (
                          <CardDescription className="text-sm" data-testid={`text-template-${campaign.id}`}>
                            Template: {campaign.template.name}
                          </CardDescription>
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
                        <Label className="text-sm font-medium">URL da Página de Pesquisa:</Label>
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
                            onClick={async () => {
                              try {
                                if (campaign.template) {
                                  await generateSurveyPdfReport(campaign, campaign.template, campaign.id);
                                  toast({ title: "PDF gerado com sucesso!" });
                                }
                              } catch (error: any) {
                                toast({ 
                                  title: "Erro ao gerar PDF", 
                                  description: error.message,
                                  variant: "destructive" 
                                });
                              }
                            }}
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
                        <Label className="text-sm font-medium">Público-Alvo:</Label>
                        <p className="text-sm text-muted-foreground" data-testid={`text-target-audience-${campaign.id}`}>
                          {campaign.targetAudience}
                        </p>
                      </div>
                    )}

                    {campaign.adminNotes && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Notas do Administrador:</Label>
                        <p className="text-sm text-muted-foreground" data-testid={`text-admin-notes-${campaign.id}`}>
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
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">Nenhuma campanha criada ainda</p>
              <Button
                onClick={handleCreateClick}
                className="rounded-full"
                data-testid="button-create-first-campaign"
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Campanha
              </Button>
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
          <div className="flex-1 overflow-y-auto px-6 py-6">
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
                              templates.map((template) => (
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
                              ))
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
                      <p className="text-sm text-muted-foreground mb-3">
                        Além da pergunta principal, esta pesquisa coletará automaticamente os seguintes dados demográficos de todos os participantes:
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
                    </CardContent>
                  </Card>
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

                  <Card className="border-[#40E0D0] bg-[#40E0D0]/5">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-[#40E0D0]" />
                        Detalhes da Pesquisa
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Prazo de Coleta:</Label>
                        <p className="text-sm font-semibold">7 dias corridos</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Investimento:</Label>
                        <p className="text-lg font-bold text-[#40E0D0]">R$ 1.250,00</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Valor será cobrado na próxima fatura do seu plano
                      </p>
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
                      <p>
                        ✓ Respeita as <strong>políticas de tráfego pago do Google Ads</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mt-3">
                        As respostas serão coletadas através de distribuição paga no Google Ads, 
                        garantindo alcance qualificado e conformidade com todas as regulamentações aplicáveis.
                      </p>
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
    </div>
  );
}
