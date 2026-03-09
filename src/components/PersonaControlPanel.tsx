import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Brain, BookOpen, Briefcase, Zap } from "lucide-react";

interface PersonaProfile {
  id: string;
  name: string;
  axis_wit: number;
  axis_pedagogy: number;
  axis_formality: number;
  axis_edge: number;
  voice_characteristics: any;
  example_phrases: string[];
}

interface PersonaAxes {
  wit: number;
  pedagogy: number;
  formality: number;
  edge: number;
}

export function PersonaControlPanel() {
  const [autoDetect, setAutoDetect] = useState(true);
  const [axes, setAxes] = useState<PersonaAxes>({
    wit: 50,
    pedagogy: 70,
    formality: 60,
    edge: 40,
  });
  const [personas, setPersonas] = useState<PersonaProfile[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<PersonaProfile | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    loadPersonas();
    loadHistory();
  }, []);

  const loadPersonas = async () => {
    const { data } = await supabase
      .from('persona_profiles')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (data) {
      setPersonas(data);
    }
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('persona_history')
      .select('*, persona_profiles(*)')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (data) {
      setHistory(data);
    }
  };

  const calculateClosestPersona = (targetAxes: PersonaAxes) => {
    let closest: PersonaProfile | null = null;
    let minDistance = Infinity;

    for (const persona of personas) {
      const distance = Math.sqrt(
        Math.pow(persona.axis_wit - targetAxes.wit, 2) +
        Math.pow(persona.axis_pedagogy - targetAxes.pedagogy, 2) +
        Math.pow(persona.axis_formality - targetAxes.formality, 2) +
        Math.pow(persona.axis_edge - targetAxes.edge, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closest = persona;
      }
    }

    setSelectedPersona(closest);
  };

  useEffect(() => {
    if (!autoDetect && personas.length > 0) {
      calculateClosestPersona(axes);
    }
  }, [axes, personas, autoDetect]);

  const selectPreset = (preset: 'feynman' | 'connery' | 'balanced' | 'casual' | 'research') => {
    setAutoDetect(false);
    const presets: Record<string, PersonaAxes> = {
      feynman: { wit: 75, pedagogy: 95, formality: 40, edge: 20 },
      connery: { wit: 90, pedagogy: 30, formality: 30, edge: 95 },
      balanced: { wit: 50, pedagogy: 70, formality: 70, edge: 40 },
      casual: { wit: 60, pedagogy: 60, formality: 20, edge: 30 },
      research: { wit: 20, pedagogy: 85, formality: 90, edge: 10 },
    };
    setAxes(presets[preset]);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Persona Control Panel
        </CardTitle>
        <CardDescription>
          Configure AI response personality and delivery style
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="control" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="control">Control</TabsTrigger>
            <TabsTrigger value="radar">Radar</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="space-y-6">
            {/* Auto-detect toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-detect" className="text-sm font-medium">
                Auto-detect from conversation
              </Label>
              <Switch
                id="auto-detect"
                checked={autoDetect}
                onCheckedChange={setAutoDetect}
              />
            </div>

            {/* Preset buttons */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Presets</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectPreset('feynman')}
                  className="justify-start"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Feynman Teacher
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectPreset('connery')}
                  className="justify-start"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Connery Edge
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectPreset('balanced')}
                  className="justify-start"
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  Balanced Scholar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectPreset('casual')}
                  className="justify-start"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Casual Guide
                </Button>
              </div>
            </div>

            {/* Axis sliders */}
            {!autoDetect && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Wit: {axes.wit}</Label>
                  <Slider
                    value={[axes.wit]}
                    onValueChange={([v]) => setAxes({ ...axes, wit: v })}
                    max={100}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">Humor and playfulness level</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Pedagogy: {axes.pedagogy}</Label>
                  <Slider
                    value={[axes.pedagogy]}
                    onValueChange={([v]) => setAxes({ ...axes, pedagogy: v })}
                    max={100}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">Teaching and explaining depth</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Formality: {axes.formality}</Label>
                  <Slider
                    value={[axes.formality]}
                    onValueChange={([v]) => setAxes({ ...axes, formality: v })}
                    max={100}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">Academic vs casual tone</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Edge: {axes.edge}</Label>
                  <Slider
                    value={[axes.edge]}
                    onValueChange={([v]) => setAxes({ ...axes, edge: v })}
                    max={100}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">Directness and sharpness</p>
                </div>
              </div>
            )}

            {/* Selected persona display */}
            {selectedPersona && !autoDetect && (
              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{selectedPersona.name}</h4>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedPersona.example_phrases[0]}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="radar">
            <div className="flex items-center justify-center py-12">
              <div className="relative w-64 h-64">
                {/* Simple radar chart visualization */}
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  {/* Grid circles */}
                  <circle cx="100" cy="100" r="80" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
                  <circle cx="100" cy="100" r="60" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
                  <circle cx="100" cy="100" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
                  <circle cx="100" cy="100" r="20" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
                  
                  {/* Axes */}
                  <line x1="100" y1="20" x2="100" y2="180" stroke="hsl(var(--border))" strokeWidth="1" />
                  <line x1="20" y1="100" x2="180" y2="100" stroke="hsl(var(--border))" strokeWidth="1" />
                  
                  {/* Data polygon */}
                  {!autoDetect && (
                    <polygon
                      points={`
                        100,${100 - (axes.wit * 0.8)}
                        ${100 + (axes.pedagogy * 0.8)},100
                        100,${100 + (axes.formality * 0.8)}
                        ${100 - (axes.edge * 0.8)},100
                      `}
                      fill="hsl(var(--primary))"
                      fillOpacity="0.3"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                    />
                  )}
                </svg>
                
                {/* Labels */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 text-xs font-medium">Wit</div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-medium">Pedagogy</div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-medium">Formality</div>
                <div className="absolute left-0 top-1/2 -translate-y-1/2 text-xs font-medium">Edge</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No persona history yet
                </p>
              ) : (
                history.map((entry) => (
                  <div key={entry.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">
                        {entry.persona_profiles?.name || 'Unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {entry.rationale}
                    </p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
