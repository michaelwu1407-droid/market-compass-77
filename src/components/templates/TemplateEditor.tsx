import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateTemplate, type AnalysisTemplate, type TemplateSection } from '@/hooks/useAnalysisTemplates';
import { cn } from '@/lib/utils';

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: AnalysisTemplate | null;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const defaultSection: () => TemplateSection = () => ({
  id: generateId(),
  title: '',
  prompt: '',
  required: false,
});

export function TemplateEditor({ open, onOpenChange, template }: TemplateEditorProps) {
  const createTemplate = useCreateTemplate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<TemplateSection[]>([defaultSection()]);

  // Reset form when dialog opens or template changes
  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setSections(template.sections.length > 0 ? template.sections : [defaultSection()]);
    } else {
      setName('');
      setDescription('');
      setSections([defaultSection()]);
    }
  }, [template, open]);

  const handleAddSection = () => {
    setSections([...sections, defaultSection()]);
  };

  const handleRemoveSection = (index: number) => {
    if (sections.length > 1) {
      setSections(sections.filter((_, i) => i !== index));
    }
  };

  const handleUpdateSection = (index: number, field: keyof TemplateSection, value: string | boolean) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    setSections(updated);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    
    const updated = [...sections];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setSections(updated);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    const validSections = sections.filter(s => s.title.trim() && s.prompt.trim());
    if (validSections.length === 0) return;

    createTemplate.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      sections: validSections,
    }, {
      onSuccess: () => {
        onOpenChange(false);
      }
    });
  };

  const isValid = name.trim() && sections.some(s => s.title.trim() && s.prompt.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template?.id ? 'Edit Template' : 'Create Template'}</DialogTitle>
          <DialogDescription>
            Define the sections and prompts for your analysis template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              placeholder="e.g., Deep Dive Analysis"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Template Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe when to use this template..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Sections */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Sections</Label>
              <Button variant="outline" size="sm" onClick={handleAddSection}>
                <Plus className="h-4 w-4 mr-1" />
                Add Section
              </Button>
            </div>

            <div className="space-y-4">
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className="border rounded-lg p-4 space-y-3 bg-card"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveSection(index, 'up')}
                        disabled={index === 0}
                      >
                        <GripVertical className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex-1">
                      <Input
                        placeholder="Section title"
                        value={section.title}
                        onChange={(e) => handleUpdateSection(index, 'title', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`required-${section.id}`} className="text-xs text-muted-foreground">
                        Required
                      </Label>
                      <Switch
                        id={`required-${section.id}`}
                        checked={section.required}
                        onCheckedChange={(checked) => handleUpdateSection(index, 'required', checked)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSection(index)}
                      disabled={sections.length === 1}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Enter the prompt for this section..."
                    value={section.prompt}
                    onChange={(e) => handleUpdateSection(index, 'prompt', e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || createTemplate.isPending}>
            {createTemplate.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
