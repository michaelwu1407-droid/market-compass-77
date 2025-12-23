import { useState } from 'react';
import { Plus, Trash2, Edit2, FileText, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalysisTemplates, useDeleteTemplate, type AnalysisTemplate } from '@/hooks/useAnalysisTemplates';
import { TemplateEditor } from '@/components/templates/TemplateEditor';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function TemplatesPage() {
  const { data: templates, isLoading } = useAnalysisTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [editingTemplate, setEditingTemplate] = useState<AnalysisTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const handleDelete = (templateId: string) => {
    setTemplateToDelete(templateId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      deleteTemplate.mutate(templateToDelete);
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const handleDuplicate = (template: AnalysisTemplate) => {
    setEditingTemplate({
      ...template,
      id: '', // New ID will be generated
      name: `${template.name} (Copy)`,
      is_default: false,
      user_id: null,
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const defaultTemplates = templates?.filter(t => t.is_default) || [];
  const userTemplates = templates?.filter(t => !t.is_default) || [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Analysis Templates</h1>
          <p className="text-muted-foreground">Create and manage templates for AI analysis reports</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Default Templates */}
      {defaultTemplates.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Default Templates</h2>
          <div className="grid gap-4">
            {defaultTemplates.map((template) => (
              <Card key={template.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant="secondary">Default</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(template)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Duplicate
                    </Button>
                  </div>
                  {template.description && (
                    <CardDescription>{template.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {template.sections.map((section) => (
                      <Badge key={section.id} variant="outline" className="text-xs">
                        {section.title}
                        {section.required && <span className="text-destructive ml-1">*</span>}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* User Templates */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Your Templates</h2>
        {userTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>You haven't created any templates yet.</p>
              <p className="text-sm">Create one to customize your analysis reports.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {userTemplates.map((template) => (
              <Card key={template.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingTemplate(template)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicate(template)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(template.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {template.description && (
                    <CardDescription>{template.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {template.sections.map((section) => (
                      <Badge key={section.id} variant="outline" className="text-xs">
                        {section.title}
                        {section.required && <span className="text-destructive ml-1">*</span>}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Template Editor Dialog */}
      <TemplateEditor
        open={isCreating || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false);
            setEditingTemplate(null);
          }
        }}
        template={editingTemplate}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
