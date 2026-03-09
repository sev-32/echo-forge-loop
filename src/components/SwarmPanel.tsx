import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Layers, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

interface EnsembleAnalysis {
  id: string;
  run_id: string;
  archivist_context: string;
  researcher_grounding: string;
  synthesizer_draft: string;
  critic_findings: any;
  confidence_score: number;
  created_at: string;
}

export function SwarmPanel() {
  const [analyses, setAnalyses] = useState<EnsembleAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<EnsembleAnalysis | null>(null);
  const [liveActivities, setLiveActivities] = useState<any[]>([]);

  useEffect(() => {
    loadAnalyses();
    loadLiveActivities();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('ensemble_updates')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'ensemble_analyses' },
        (payload) => {
          setAnalyses(prev => [payload.new as EnsembleAnalysis, ...prev]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const loadAnalyses = async () => {
    const { data } = await supabase
      .from('ensemble_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) {
      setAnalyses(data);
      if (data.length > 0) {
        setSelectedAnalysis(data[0]);
      }
    }
  };

  const loadLiveActivities = async () => {
    // Query recent witness envelopes for live activity
    const { data } = await supabase
      .from('witness_envelopes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (data) {
      setLiveActivities(data);
    }
  };

  return (
    <div className="w-full">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Swarm Intelligence Monitor
          </CardTitle>
          <CardDescription>
            Real-time multi-agent ensemble analysis and polycaste transformations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="live" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="live">
                <Activity className="h-4 w-4 mr-2" />
                Live Activity
              </TabsTrigger>
              <TabsTrigger value="polycaste">
                <Sparkles className="h-4 w-4 mr-2" />
                Polycaste
              </TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-3">
                  {liveActivities.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No recent activity
                    </p>
                  ) : (
                    liveActivities.map((activity) => (
                      <div key={activity.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant={
                            activity.confidence_band === 'A' ? 'default' :
                            activity.confidence_band === 'B' ? 'secondary' : 'outline'
                          }>
                            {activity.operation_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(activity.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Confidence:</span>
                            <span className="ml-1 font-medium">
                              {(activity.confidence_score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Band:</span>
                            <span className="ml-1 font-medium">{activity.confidence_band}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Gate:</span>
                            <span className="ml-1 font-medium">{activity.kappa_gate_result}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="polycaste">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Analysis list */}
                <div className="lg:col-span-1">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {analyses.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No polycaste analyses yet
                        </p>
                      ) : (
                        analyses.map((analysis) => (
                          <button
                            key={analysis.id}
                            onClick={() => setSelectedAnalysis(analysis)}
                            className={`w-full text-left p-3 border rounded-lg transition-colors ${
                              selectedAnalysis?.id === analysis.id
                                ? 'bg-primary/10 border-primary'
                                : 'hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono text-muted-foreground">
                                {analysis.run_id.substring(0, 8)}
                              </span>
                              {analysis.critic_findings?.overall_score >= 85 ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : analysis.critic_findings?.overall_score >= 70 ? (
                                <AlertCircle className="h-4 w-4 text-yellow-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(analysis.created_at).toLocaleString()}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Analysis details */}
                <div className="lg:col-span-2">
                  {selectedAnalysis ? (
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {/* Critic results */}
                        <div className="p-4 border rounded-lg">
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Adversarial Critique
                          </h4>
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-muted-foreground">Overall Score</span>
                              <span className="text-2xl font-bold">
                                {selectedAnalysis.critic_findings?.overall_score || 0}
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${selectedAnalysis.critic_findings?.overall_score || 0}%` }}
                              />
                            </div>
                          </div>
                          {selectedAnalysis.critic_findings?.findings?.map((finding: any, i: number) => (
                            <div key={i} className="mb-2 p-2 bg-muted rounded text-sm">
                              <Badge variant="outline" className="mb-1">
                                {finding.severity}
                              </Badge>
                              <p>{finding.issue}</p>
                            </div>
                          ))}
                        </div>

                        {/* Ensemble outputs */}
                        <div className="p-4 border rounded-lg">
                          <h4 className="font-medium mb-2">Archivist Context</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {selectedAnalysis.archivist_context.substring(0, 300)}...
                          </p>
                        </div>

                        <div className="p-4 border rounded-lg">
                          <h4 className="font-medium mb-2">Researcher Grounding</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {selectedAnalysis.researcher_grounding.substring(0, 300)}...
                          </p>
                        </div>

                        <div className="p-4 border rounded-lg">
                          <h4 className="font-medium mb-2">Synthesizer Draft</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {selectedAnalysis.synthesizer_draft.substring(0, 300)}...
                          </p>
                        </div>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                      Select an analysis to view details
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
