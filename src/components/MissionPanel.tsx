import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Target, Play, Pause, StopCircle, CheckCircle, AlertTriangle,
  Clock, Shield, Zap, Eye, Plus, ChevronRight, Activity, X
} from 'lucide-react';

// ============================================
// Types (per §30 Mission Object + §35.9)
// ============================================

interface Mission {
  id: string;
  title: string;
  objective: string;
  status: string;
  autonomy_tier: number;
  risk_class: string;
  allowed_tools: string[];
  forbidden_actions: string[];
  budget_limits: { tokens: number; steps: number };
  stop_conditions: string[];
  escalation_conditions: string[];
  success_metrics: string[];
  rollback_plan: string | null;
  confidence_trajectory: number[];
  run_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MissionStep {
  id: string;
  mission_id: string;
  sequence_no: number;
  status: string;
  action_summary: string;
  validation_summary: string | null;
  confidence: number | null;
  result: any;
  tools_invoked: string[];
  artifacts_touched: string[];
  started_at: string | null;
  completed_at: string | null;
}

// ============================================
// Constants (per §30.4, §30.6)
// ============================================

const statusColors: Record<string, string> = {
  drafted: 'bg-muted text-muted-foreground',
  awaiting_approval: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-blue-500/20 text-blue-400',
  active: 'bg-green-500/20 text-green-400',
  paused: 'bg-orange-500/20 text-orange-400',
  blocked: 'bg-red-500/20 text-red-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
  aborted: 'bg-gray-500/20 text-gray-400',
  rolled_back: 'bg-purple-500/20 text-purple-400',
};

const statusIcons: Record<string, any> = {
  drafted: Eye,
  awaiting_approval: AlertTriangle,
  approved: CheckCircle,
  active: Activity,
  paused: Pause,
  blocked: AlertTriangle,
  completed: CheckCircle,
  failed: X,
  aborted: StopCircle,
  rolled_back: Target,
};

// §30.6 Autonomy Levels
const tierLabels = ['Tier 0: Advisory', 'Tier 1: User-Stepped', 'Tier 2: Bounded Exec', 'Tier 3: Managed Delegation'];
const tierColors = ['text-blue-400', 'text-green-400', 'text-yellow-400', 'text-orange-400'];

const riskClasses = ['minimal', 'low', 'moderate', 'high', 'critical'];

const commonTools = ['read', 'write', 'compute', 'web', 'api', 'shell', 'automation'];

// ============================================
// Main Component
// ============================================

export function MissionPanel() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [steps, setSteps] = useState<MissionStep[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load missions
  const loadMissions = async () => {
    const { data, error } = await supabase
      .from('missions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Failed to load missions:', error);
      return;
    }
    
    setMissions((data || []) as unknown as Mission[]);
    if (data && data.length > 0 && !selectedMission) {
      setSelectedMission(data[0] as unknown as Mission);
    }
  };

  // Load steps for selected mission
  const loadSteps = async (missionId: string) => {
    const { data, error } = await supabase
      .from('mission_steps')
      .select('*')
      .eq('mission_id', missionId)
      .order('sequence_no', { ascending: true });
    
    if (error) {
      console.error('Failed to load steps:', error);
      return;
    }
    
    setSteps((data || []) as unknown as MissionStep[]);
  };

  useEffect(() => {
    loadMissions();
    
    // Subscribe to realtime updates
    const missionChannel = supabase
      .channel('missions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => {
        loadMissions();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(missionChannel);
    };
  }, []);

  useEffect(() => {
    if (selectedMission) {
      loadSteps(selectedMission.id);
      
      const stepsChannel = supabase
        .channel(`mission-steps-${selectedMission.id}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'mission_steps',
          filter: `mission_id=eq.${selectedMission.id}`
        }, () => {
          loadSteps(selectedMission.id);
        })
        .subscribe();
      
      return () => {
        supabase.removeChannel(stepsChannel);
      };
    }
  }, [selectedMission]);

  // §30.11 Human Override - Update mission status
  const updateStatus = async (newStatus: string) => {
    if (!selectedMission) return;
    
    setLoading(true);
    const { error } = await supabase
      .from('missions')
      .update({ status: newStatus as any })
      .eq('id', selectedMission.id);
    
    if (error) {
      console.error('Failed to update status:', error);
    } else {
      setSelectedMission({ ...selectedMission, status: newStatus });
    }
    setLoading(false);
  };

  return (
    <div className="h-full flex gap-3 p-3">
      {/* Left Panel: Mission List */}
      <div className="w-80 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Missions
          </h2>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <CreateMissionForm 
                onCreated={() => {
                  setShowCreate(false);
                  loadMissions();
                }} 
              />
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2">
            {missions.map((mission) => {
              const StatusIcon = statusIcons[mission.status] || Target;
              return (
                <Card
                  key={mission.id}
                  className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                    selectedMission?.id === mission.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedMission(mission)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-medium text-xs truncate">{mission.title}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{mission.objective}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge className={`text-[9px] px-1.5 py-0 ${statusColors[mission.status]}`}>
                        {mission.status}
                      </Badge>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${tierColors[mission.autonomy_tier]}`}>
                        T{mission.autonomy_tier}
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        {missions.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div>
              <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No missions yet</p>
              <p className="text-xs text-muted-foreground/70">Create your first mission to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Mission Detail */}
      <div className="flex-1 flex flex-col">
        {selectedMission ? (
          <MissionDetail
            mission={selectedMission}
            steps={steps}
            onUpdateStatus={updateStatus}
            loading={loading}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a mission to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Mission Detail Component
// ============================================

function MissionDetail({ 
  mission, 
  steps, 
  onUpdateStatus, 
  loading 
}: { 
  mission: Mission; 
  steps: MissionStep[]; 
  onUpdateStatus: (status: string) => void;
  loading: boolean;
}) {
  const StatusIcon = statusIcons[mission.status] || Target;

  // §30.11 Human Override Controls
  const getAvailableActions = () => {
    const actions: { label: string; status: string; icon: any }[] = [];
    
    if (mission.status === 'drafted') {
      actions.push({ label: 'Submit for Approval', status: 'awaiting_approval', icon: AlertTriangle });
    }
    if (mission.status === 'awaiting_approval') {
      actions.push({ label: 'Approve', status: 'approved', icon: CheckCircle });
      actions.push({ label: 'Reject', status: 'drafted', icon: X });
    }
    if (mission.status === 'approved') {
      actions.push({ label: 'Start Mission', status: 'active', icon: Play });
    }
    if (mission.status === 'active') {
      actions.push({ label: 'Pause', status: 'paused', icon: Pause });
      actions.push({ label: 'Abort', status: 'aborted', icon: StopCircle });
    }
    if (mission.status === 'paused') {
      actions.push({ label: 'Resume', status: 'active', icon: Play });
      actions.push({ label: 'Abort', status: 'aborted', icon: StopCircle });
    }
    
    return actions;
  };

  const actions = getAvailableActions();

  return (
    <Card className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-5 w-5 text-primary" />
            <h3 className="font-bold">{mission.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${statusColors[mission.status]}`}>
              {mission.status}
            </Badge>
            <Badge variant="outline" className={tierColors[mission.autonomy_tier]}>
              {tierLabels[mission.autonomy_tier]}
            </Badge>
            <Badge variant="outline">
              <Shield className="h-3 w-3 mr-1" />
              {mission.risk_class}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{mission.objective}</p>

        {/* §30.11 Human Override Controls */}
        {actions.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            {actions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <Button
                  key={action.status}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => onUpdateStatus(action.status)}
                  disabled={loading}
                >
                  <ActionIcon className="h-3 w-3" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="steps">Steps ({steps.length})</TabsTrigger>
          <TabsTrigger value="governance">Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Budget Limits</div>
              <div className="text-sm">
                <div>Tokens: {mission.budget_limits.tokens?.toLocaleString() || 'N/A'}</div>
                <div>Max Steps: {mission.budget_limits.steps || 'N/A'}</div>
              </div>
            </Card>

            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Allowed Tools</div>
              <div className="flex flex-wrap gap-1">
                {mission.allowed_tools.length > 0 ? (
                  mission.allowed_tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-[10px]">
                      {tool}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">All tools</span>
                )}
              </div>
            </Card>
          </div>

          {mission.success_metrics.length > 0 && (
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-2">Success Metrics</div>
              <ul className="text-sm space-y-1">
                {mission.success_metrics.map((metric, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0 mt-0.5" />
                    <span>{metric}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {mission.stop_conditions.length > 0 && (
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-2">Stop Conditions</div>
              <ul className="text-sm space-y-1">
                {mission.stop_conditions.map((condition, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <StopCircle className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {mission.rollback_plan && (
            <Card className="p-3">
              <div className="text-xs text-muted-foreground mb-2">Rollback Plan</div>
              <p className="text-sm">{mission.rollback_plan}</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="steps" className="flex-1 p-3">
          <ScrollArea className="h-full">
            {steps.length > 0 ? (
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <Card key={step.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                          {step.sequence_no}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{step.action_summary}</span>
                          <Badge variant="outline" className="text-[10px]">{step.status}</Badge>
                          {step.confidence && (
                            <Badge variant="outline" className="text-[10px]">
                              {(step.confidence * 100).toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                        {step.validation_summary && (
                          <p className="text-xs text-muted-foreground">{step.validation_summary}</p>
                        )}
                        {step.tools_invoked.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {step.tools_invoked.map((tool, j) => (
                              <Badge key={j} variant="secondary" className="text-[9px]">
                                <Zap className="h-2.5 w-2.5 mr-0.5" />
                                {tool}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {step.completed_at && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {new Date(step.completed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No steps recorded yet</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="governance" className="flex-1 p-3 space-y-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-2">Escalation Conditions</div>
            {mission.escalation_conditions.length > 0 ? (
              <ul className="text-sm space-y-1">
                {mission.escalation_conditions.map((condition, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No escalation conditions</p>
            )}
          </Card>

          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-2">Forbidden Actions</div>
            {mission.forbidden_actions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {mission.forbidden_actions.map((action, i) => (
                  <Badge key={i} variant="destructive" className="text-[10px]">
                    <X className="h-2.5 w-2.5 mr-0.5" />
                    {action}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No forbidden actions</p>
            )}
          </Card>

          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-2">Mission Metadata</div>
            <div className="text-xs space-y-1">
              <div><span className="text-muted-foreground">ID:</span> {mission.id}</div>
              <div><span className="text-muted-foreground">Created:</span> {new Date(mission.created_at).toLocaleString()}</div>
              {mission.run_id && <div><span className="text-muted-foreground">Run ID:</span> {mission.run_id}</div>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ============================================
// Create Mission Form (per §30.3)
// ============================================

function CreateMissionForm({ onCreated }: { onCreated: () => void }) {
  const [formData, setFormData] = useState({
    title: '',
    objective: '',
    autonomy_tier: 0,
    risk_class: 'low',
    allowed_tools: [] as string[],
    stop_conditions: [] as string[],
    success_metrics: [] as string[],
    escalation_conditions: [] as string[],
    forbidden_actions: [] as string[],
    rollback_plan: '',
    budget_tokens: 50000,
    budget_steps: 20,
  });

  const [tempInput, setTempInput] = useState('');
  const [tempField, setTempField] = useState<'stop' | 'success' | 'escalation' | 'forbidden'>('stop');

  const addToList = (field: 'stop_conditions' | 'success_metrics' | 'escalation_conditions' | 'forbidden_actions') => {
    if (!tempInput.trim()) return;
    setFormData({
      ...formData,
      [field]: [...formData[field], tempInput.trim()]
    });
    setTempInput('');
  };

  const removeFromList = (field: 'stop_conditions' | 'success_metrics' | 'escalation_conditions' | 'forbidden_actions', index: number) => {
    setFormData({
      ...formData,
      [field]: formData[field].filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { error } = await supabase.from('missions').insert({
      title: formData.title,
      objective: formData.objective,
      autonomy_tier: formData.autonomy_tier,
      risk_class: formData.risk_class,
      allowed_tools: formData.allowed_tools,
      stop_conditions: formData.stop_conditions,
      success_metrics: formData.success_metrics,
      escalation_conditions: formData.escalation_conditions,
      forbidden_actions: formData.forbidden_actions,
      rollback_plan: formData.rollback_plan || null,
      budget_limits: {
        tokens: formData.budget_tokens,
        steps: formData.budget_steps,
      },
      status: 'drafted',
    });

    if (error) {
      console.error('Failed to create mission:', error);
      return;
    }

    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Create New Mission</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Mission title"
            required
          />
        </div>

        <div>
          <Label htmlFor="objective">Objective</Label>
          <Textarea
            id="objective"
            value={formData.objective}
            onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
            placeholder="What should this mission accomplish?"
            rows={3}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="autonomy_tier">Autonomy Tier</Label>
            <Select
              value={formData.autonomy_tier.toString()}
              onValueChange={(value) => setFormData({ ...formData, autonomy_tier: parseInt(value) })}
            >
              <SelectTrigger id="autonomy_tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tierLabels.map((label, i) => (
                  <SelectItem key={i} value={i.toString()}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="risk_class">Risk Class</Label>
            <Select
              value={formData.risk_class}
              onValueChange={(value) => setFormData({ ...formData, risk_class: value })}
            >
              <SelectTrigger id="risk_class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {riskClasses.map((risk) => (
                  <SelectItem key={risk} value={risk}>{risk}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="budget_tokens">Budget: Tokens</Label>
            <Input
              id="budget_tokens"
              type="number"
              value={formData.budget_tokens}
              onChange={(e) => setFormData({ ...formData, budget_tokens: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="budget_steps">Budget: Max Steps</Label>
            <Input
              id="budget_steps"
              type="number"
              value={formData.budget_steps}
              onChange={(e) => setFormData({ ...formData, budget_steps: parseInt(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <Label>Allowed Tools</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {commonTools.map((tool) => {
              const isSelected = formData.allowed_tools.includes(tool);
              return (
                <Badge
                  key={tool}
                  variant={isSelected ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => {
                    if (isSelected) {
                      setFormData({
                        ...formData,
                        allowed_tools: formData.allowed_tools.filter(t => t !== tool)
                      });
                    } else {
                      setFormData({
                        ...formData,
                        allowed_tools: [...formData.allowed_tools, tool]
                      });
                    }
                  }}
                >
                  {tool}
                </Badge>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Leave empty to allow all tools</p>
        </div>

        <div>
          <Label>Success Metrics</Label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Add a success metric..."
              value={tempField === 'success' ? tempInput : ''}
              onChange={(e) => { setTempInput(e.target.value); setTempField('success'); }}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToList('success_metrics'))}
            />
            <Button type="button" size="sm" onClick={() => addToList('success_metrics')}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.success_metrics.map((metric, i) => (
              <Badge key={i} variant="secondary" className="text-xs gap-1">
                {metric}
                <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromList('success_metrics', i)} />
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <Label>Stop Conditions</Label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Add a stop condition..."
              value={tempField === 'stop' ? tempInput : ''}
              onChange={(e) => { setTempInput(e.target.value); setTempField('stop'); }}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addToList('stop_conditions'))}
            />
            <Button type="button" size="sm" onClick={() => addToList('stop_conditions')}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.stop_conditions.map((condition, i) => (
              <Badge key={i} variant="secondary" className="text-xs gap-1">
                {condition}
                <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromList('stop_conditions', i)} />
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="rollback_plan">Rollback Plan (optional)</Label>
          <Textarea
            id="rollback_plan"
            value={formData.rollback_plan}
            onChange={(e) => setFormData({ ...formData, rollback_plan: e.target.value })}
            placeholder="How to undo this mission's actions if needed..."
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit">Create Mission</Button>
      </div>
    </form>
  );
}
