import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, AlertCircle } from "lucide-react";
import logoUrl from "@assets/logo pol_1763308638963.png";
import surveyBackground from "@assets/d39a8f83-9488-4450-a920-1ca2b1507b3e_1763589660859.jpg";

type CustomQuestion = {
  id: string;
  questionText: string;
  questionType: 'open_text' | 'single_choice' | 'multiple_choice';
  options?: string[];
  required: boolean;
};

type CustomDemographicField = {
  id: string;
  label: string;
  fieldType: 'text' | 'single_choice' | 'multiple_choice';
  options?: string[];
  required: boolean;
};

type SurveyData = {
  campaign: {
    id: string;
    campaignName: string;
    slug: string;
    status: string;
    customMainQuestion?: string | null;
    customMainQuestionType?: string | null;
    customMainQuestionOptions?: string[] | null;
    customQuestions?: CustomQuestion[] | null;
    demographicFields?: string[] | null;
    customDemographicFields?: CustomDemographicField[] | null;
  };
  template: {
    questionText: string;
    questionType: "open_text" | "single_choice" | "multiple_choice" | "rating";
    options: string[] | null;
  };
};

export default function SurveyLanding() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [selectedRatings, setSelectedRatings] = useState<Record<string, number>>({});
  const [customDemographicValues, setCustomDemographicValues] = useState<Record<string, string | string[]>>({});

  const { data: surveyData, isLoading, error } = useQuery<SurveyData>({
    queryKey: ["/api/pesquisa", slug],
    enabled: !!slug,
  });

  // Get the effective question data (custom overrides template)
  const getEffectiveQuestionData = () => {
    if (!surveyData) return null;
    
    const hasCustomQuestion = surveyData.campaign.customMainQuestion && surveyData.campaign.customMainQuestion.trim() !== '';
    const questionText = hasCustomQuestion 
      ? surveyData.campaign.customMainQuestion! 
      : surveyData.template.questionText;
    const questionType = (surveyData.campaign.customMainQuestionType || surveyData.template.questionType) as "open_text" | "single_choice" | "multiple_choice" | "rating";
    const options = surveyData.campaign.customMainQuestionOptions?.length 
      ? surveyData.campaign.customMainQuestionOptions 
      : surveyData.template.options;
    
    return { questionText, questionType, options };
  };

  const effectiveQuestion = getEffectiveQuestionData();
  
  // Get enabled demographic fields (default to all if not specified)
  const enabledDemographicFields = surveyData?.campaign.demographicFields || 
    ["gender", "ageRange", "employmentType", "housingType", "hasChildren", "politicalIdeology"];
  
  const isFieldEnabled = (field: string) => enabledDemographicFields.includes(field);

  const formSchema = z.object({
    // Demographic fields (conditional based on campaign settings)
    gender: isFieldEnabled("gender") 
      ? z.enum(["masculino", "feminino", "outro", "prefiro_nao_dizer"], {
          required_error: "Por favor, selecione seu sexo",
        })
      : z.enum(["masculino", "feminino", "outro", "prefiro_nao_dizer"]).optional(),
    ageRange: isFieldEnabled("ageRange")
      ? z.enum(["menos_35", "mais_35"], {
          required_error: "Por favor, selecione sua faixa etária",
        })
      : z.enum(["menos_35", "mais_35"]).optional(),
    employmentType: isFieldEnabled("employmentType")
      ? z.enum(["carteira_assinada", "autonomo", "desempregado", "aposentado", "outro"], {
          required_error: "Por favor, selecione seu tipo de trabalho",
        })
      : z.enum(["carteira_assinada", "autonomo", "desempregado", "aposentado", "outro"]).optional(),
    housingType: isFieldEnabled("housingType")
      ? z.enum(["casa_propria", "aluguel", "cedido", "outro"], {
          required_error: "Por favor, selecione seu tipo de moradia",
        })
      : z.enum(["casa_propria", "aluguel", "cedido", "outro"]).optional(),
    hasChildren: isFieldEnabled("hasChildren")
      ? z.enum(["sim", "nao"], {
          required_error: "Por favor, indique se tem filhos",
        })
      : z.enum(["sim", "nao"]).optional(),
    politicalIdeology: isFieldEnabled("politicalIdeology")
      ? z.enum(["direita", "centro", "esquerda", "prefiro_nao_comentar"], {
          required_error: "Por favor, selecione sua ideologia política",
        })
      : z.enum(["direita", "centro", "esquerda", "prefiro_nao_comentar"]).optional(),
    
    // Survey response fields (conditional based on question type)
    answer: z.string().optional(),
    answers: z.array(z.string()).optional(),
    ratings: z.record(z.number()).optional(),
  }).refine((data) => {
    const questionType = effectiveQuestion?.questionType;
    if (questionType === "open_text") {
      return !!data.answer && data.answer.trim().length > 0;
    }
    if (questionType === "single_choice") {
      return !!data.answer;
    }
    if (questionType === "multiple_choice") {
      return data.answers && data.answers.length > 0;
    }
    if (questionType === "rating") {
      return data.ratings && Object.keys(data.ratings).length > 0;
    }
    return false;
  }, {
    message: "Por favor, responda a pergunta",
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      gender: undefined,
      ageRange: undefined,
      employmentType: undefined,
      housingType: undefined,
      hasChildren: undefined,
      politicalIdeology: undefined,
      answer: "",
      answers: [],
      ratings: {},
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const payload: any = {
        // Demographic fields
        gender: data.gender,
        ageRange: data.ageRange,
        employmentType: data.employmentType,
        housingType: data.housingType,
        hasChildren: data.hasChildren,
        politicalIdeology: data.politicalIdeology,
      };
      
      // Response data based on question type
      const questionType = effectiveQuestion?.questionType;
      if (questionType === "open_text") {
        payload.responseData = { answer: data.answer };
      } else if (questionType === "single_choice") {
        payload.responseData = { answer: data.answer };
      } else if (questionType === "multiple_choice") {
        payload.responseData = { answers: data.answers };
      } else if (questionType === "rating") {
        payload.responseData = { ratings: data.ratings };
      }

      // Include custom demographic field values if any
      if (Object.keys(customDemographicValues).length > 0) {
        payload.customDemographicData = customDemographicValues;
      }

      const res = await apiRequest("POST", `/api/pesquisa/${slug}/submit`, payload);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Resposta enviada com sucesso!",
        description: "Obrigado por participar da nossa pesquisa.",
      });
    },
    onError: (error: Error) => {
      // Check if it's a duplicate response error (user-friendly warning)
      const isDuplicateError = error.message.includes("já respondeu");
      
      toast({
        title: isDuplicateError ? "Atenção" : "Erro ao enviar resposta",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    submitMutation.mutate(data);
  };

  const handleRatingChange = (option: string, rating: number) => {
    const newRatings = { ...selectedRatings, [option]: rating };
    setSelectedRatings(newRatings);
    form.setValue("ratings", newRatings);
  };

  useEffect(() => {
    if (surveyData && effectiveQuestion) {
      const cleanName = surveyData.campaign.campaignName.replace(/\s*\(Neutra\)\s*/gi, '');
      document.title = `${cleanName} | Politicall`;
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute(
          "content",
          `Participe da pesquisa: ${effectiveQuestion.questionText}`
        );
      } else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = `Participe da pesquisa: ${effectiveQuestion.questionText}`;
        document.head.appendChild(meta);
      }
    }
  }, [surveyData, effectiveQuestion]);

  if (isLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4 relative"
        style={{
          backgroundImage: 'url(/attached_assets/242%20(1)_1763481516412.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
        <Card className="w-full max-w-2xl relative z-10">
          <CardHeader className="space-y-4">
            <Skeleton className="h-12 w-32 mx-auto" />
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !surveyData) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4 relative"
        style={{
          backgroundImage: 'url(/attached_assets/242%20(1)_1763481516412.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
        <Card className="w-full max-w-2xl relative z-10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <AlertCircle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle data-testid="text-error-title">Pesquisa não encontrada</CardTitle>
            <CardDescription data-testid="text-error-description">
              A pesquisa que você está procurando não existe ou não está mais disponível.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (surveyData.campaign.status !== "active" && surveyData.campaign.status !== "approved") {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4 relative"
        style={{
          backgroundImage: 'url(/attached_assets/242%20(1)_1763481516412.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
        <Card className="w-full max-w-2xl relative z-10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <AlertCircle className="h-16 w-16 text-muted-foreground" />
            </div>
            <CardTitle data-testid="text-inactive-title">Pesquisa não disponível</CardTitle>
            <CardDescription data-testid="text-inactive-description">
              Esta pesquisa não está mais aceitando respostas.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4 relative"
        style={{
          backgroundImage: 'url(/attached_assets/242%20(1)_1763481516412.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
        <Card className="w-full max-w-2xl border-[#40E0D0] relative z-10">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto mb-4">
              <CheckCircle2 className="h-24 w-24 text-[#40E0D0]" data-testid="icon-success" />
            </div>
            <CardTitle className="text-3xl text-[#40E0D0]" data-testid="text-success-title">
              Resposta enviada com sucesso!
            </CardTitle>
            <CardDescription className="text-lg" data-testid="text-success-description">
              Obrigado por participar da nossa pesquisa. Sua opinião é muito importante!
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen relative"
      style={{
        backgroundImage: `url(${surveyBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
      <div className="container max-w-3xl mx-auto py-8 px-4 sm:py-12 sm:px-6 relative z-10">
        <div className="text-center mb-8">
          <img 
            src={logoUrl} 
            alt="Politicall" 
            className="h-12 sm:h-16 mx-auto mb-6" 
            data-testid="img-logo"
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2" data-testid="text-campaign-name">
            {surveyData.campaign.campaignName.replace(/\s*\(Neutra\)\s*/gi, '')}
          </h1>
          <p className="text-sm text-white/80">
            Pesquisa de opinião pública
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">
              {enabledDemographicFields.length > 0 ? "Dados Demográficos" : "Pesquisa de Opinião"}
            </CardTitle>
            <CardDescription>
              {enabledDemographicFields.length > 0 
                ? "Para fins estatísticos, precisamos de algumas informações básicas. Suas respostas são anônimas."
                : "Por favor, responda a pesquisa abaixo. Suas respostas são anônimas."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Demographic Fields Section - Only show enabled fields */}
                {enabledDemographicFields.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isFieldEnabled("gender") && (
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sexo</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-gender">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="masculino">Masculino</SelectItem>
                                <SelectItem value="feminino">Feminino</SelectItem>
                                <SelectItem value="outro">Outro</SelectItem>
                                <SelectItem value="prefiro_nao_dizer">Prefiro não dizer</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {isFieldEnabled("ageRange") && (
                      <FormField
                        control={form.control}
                        name="ageRange"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Faixa Etária</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-age-range">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="menos_35">Menos de 35 anos</SelectItem>
                                <SelectItem value="mais_35">35 anos ou mais</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {isFieldEnabled("employmentType") && (
                      <FormField
                        control={form.control}
                        name="employmentType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Trabalho</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-employment-type">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="carteira_assinada">Carteira Assinada</SelectItem>
                                <SelectItem value="autonomo">Autônomo</SelectItem>
                                <SelectItem value="desempregado">Desempregado</SelectItem>
                                <SelectItem value="aposentado">Aposentado</SelectItem>
                                <SelectItem value="outro">Outro</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {isFieldEnabled("housingType") && (
                      <FormField
                        control={form.control}
                        name="housingType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Moradia</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-housing-type">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="casa_propria">Casa Própria</SelectItem>
                                <SelectItem value="aluguel">Aluguel</SelectItem>
                                <SelectItem value="cedido">Cedido</SelectItem>
                                <SelectItem value="outro">Outro</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {isFieldEnabled("hasChildren") && (
                      <FormField
                        control={form.control}
                        name="hasChildren"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tem Filhos?</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-has-children">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="sim">Sim</SelectItem>
                                <SelectItem value="nao">Não</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {isFieldEnabled("politicalIdeology") && (
                      <FormField
                        control={form.control}
                        name="politicalIdeology"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ideologia Política</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-political-ideology">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="direita">Direita</SelectItem>
                                <SelectItem value="centro">Centro</SelectItem>
                                <SelectItem value="esquerda">Esquerda</SelectItem>
                                <SelectItem value="prefiro_nao_comentar">Prefiro não comentar</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}

                {/* Custom Demographic Fields Section */}
                {surveyData.campaign.customDemographicFields && surveyData.campaign.customDemographicFields.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {surveyData.campaign.customDemographicFields.map((customField, fieldIndex) => (
                      <div key={customField.id} className="space-y-2">
                        <Label className={customField.required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""}>
                          {customField.label}
                        </Label>
                        
                        {customField.fieldType === "text" && (
                          <Input
                            placeholder={`Digite ${customField.label.toLowerCase()}...`}
                            value={(customDemographicValues[customField.id] as string) || ""}
                            onChange={(e) => setCustomDemographicValues(prev => ({
                              ...prev,
                              [customField.id]: e.target.value
                            }))}
                            data-testid={`input-custom-demographic-${fieldIndex}`}
                          />
                        )}
                        
                        {customField.fieldType === "single_choice" && customField.options && (
                          <Select
                            value={(customDemographicValues[customField.id] as string) || ""}
                            onValueChange={(value) => setCustomDemographicValues(prev => ({
                              ...prev,
                              [customField.id]: value
                            }))}
                          >
                            <SelectTrigger data-testid={`select-custom-demographic-${fieldIndex}`}>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {customField.options.map((option, optIndex) => (
                                <SelectItem key={optIndex} value={option}>{option}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {customField.fieldType === "multiple_choice" && customField.options && (
                          <div className="space-y-2">
                            {customField.options.map((option, optIndex) => {
                              const currentValues = (customDemographicValues[customField.id] as string[]) || [];
                              return (
                                <div key={optIndex} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`custom-demo-${customField.id}-${optIndex}`}
                                    checked={currentValues.includes(option)}
                                    onCheckedChange={(checked) => {
                                      const newValues = checked
                                        ? [...currentValues, option]
                                        : currentValues.filter(v => v !== option);
                                      setCustomDemographicValues(prev => ({
                                        ...prev,
                                        [customField.id]: newValues
                                      }));
                                    }}
                                    data-testid={`checkbox-custom-demographic-${fieldIndex}-${optIndex}`}
                                  />
                                  <Label htmlFor={`custom-demo-${customField.id}-${optIndex}`} className="cursor-pointer">
                                    {option}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(enabledDemographicFields.length > 0 || (surveyData.campaign.customDemographicFields && surveyData.campaign.customDemographicFields.length > 0)) && <Separator className="my-8" />}

                {/* Survey Question Section */}
                <div>
                  <h3 className="text-xl font-semibold mb-2" data-testid="text-question">
                    {effectiveQuestion?.questionText}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Por favor, responda a pergunta abaixo.
                  </p>
                </div>

                {effectiveQuestion?.questionType === "open_text" && (
                  <FormField
                    control={form.control}
                    name="answer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sua resposta</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Digite sua resposta aqui..."
                            className="min-h-32 resize-none"
                            data-testid="input-open-text"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {effectiveQuestion?.questionType === "single_choice" && effectiveQuestion?.options && (
                  <FormField
                    control={form.control}
                    name="answer"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            data-testid="radio-group-single-choice"
                          >
                            <div className="space-y-3">
                              {effectiveQuestion.options!.map((option, index) => (
                                <div
                                  key={index}
                                  className="flex items-center space-x-3 rounded-lg border p-4 hover-elevate"
                                >
                                  <RadioGroupItem 
                                    value={option} 
                                    id={`option-${index}`}
                                    data-testid={`radio-option-${index}`}
                                  />
                                  <Label
                                    htmlFor={`option-${index}`}
                                    className="flex-1 cursor-pointer text-base"
                                  >
                                    {option}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {effectiveQuestion?.questionType === "multiple_choice" && effectiveQuestion?.options && (
                  <FormField
                    control={form.control}
                    name="answers"
                    render={() => (
                      <FormItem>
                        <div className="space-y-3">
                          {effectiveQuestion.options!.map((option, index) => (
                            <FormField
                              key={index}
                              control={form.control}
                              name="answers"
                              render={({ field }) => (
                                <FormItem
                                  className="flex items-center space-x-3 rounded-lg border p-4 hover-elevate"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(option)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...(field.value || []), option])
                                          : field.onChange(
                                              field.value?.filter((value) => value !== option)
                                            );
                                      }}
                                      data-testid={`checkbox-option-${index}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="flex-1 cursor-pointer text-base font-normal">
                                    {option}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {effectiveQuestion?.questionType === "rating" && effectiveQuestion?.options && (
                  <div className="space-y-4">
                    {effectiveQuestion.options.map((option, index) => (
                      <div key={index} className="space-y-2">
                        <Label className="text-base" data-testid={`label-rating-${index}`}>
                          {option}
                        </Label>
                        <div className="flex gap-2 flex-wrap">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <Button
                              key={rating}
                              type="button"
                              variant={selectedRatings[option] === rating ? "default" : "outline"}
                              size="default"
                              className={`rounded-full min-w-12 ${
                                selectedRatings[option] === rating
                                  ? "bg-[#40E0D0] hover:bg-[#48D1CC] text-white border-[#40E0D0]"
                                  : ""
                              }`}
                              onClick={() => handleRatingChange(option, rating)}
                              data-testid={`button-rating-${index}-${rating}`}
                            >
                              {rating}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {form.formState.errors.ratings && (
                      <p className="text-sm text-destructive">
                        Por favor, avalie todas as opções
                      </p>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full rounded-full bg-[#40E0D0] hover:bg-[#48D1CC] text-white text-lg py-6"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit"
                >
                  {submitMutation.isPending ? "Enviando..." : "Enviar Resposta"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">Pesquisa em conformidade com as normas do TSE</p>
      </div>
    </div>
  );
}
