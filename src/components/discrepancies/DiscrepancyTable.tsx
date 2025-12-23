import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { MoreHorizontal, Check, X, MessageSquare } from 'lucide-react';
import { DataDiscrepancy, useUpdateDiscrepancy, useBulkUpdateDiscrepancies } from '@/hooks/useDiscrepancies';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface DiscrepancyTableProps {
  discrepancies: DataDiscrepancy[];
  isLoading: boolean;
}

export function DiscrepancyTable({ discrepancies, isLoading }: DiscrepancyTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; id: string; notes: string }>({
    open: false,
    id: '',
    notes: '',
  });

  const updateMutation = useUpdateDiscrepancy();
  const bulkUpdateMutation = useBulkUpdateDiscrepancies();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(discrepancies.map(d => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await updateMutation.mutateAsync({ id, status });
      toast.success(`Marked as ${status}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleBulkUpdate = async (status: string) => {
    if (selectedIds.size === 0) return;
    try {
      await bulkUpdateMutation.mutateAsync({ ids: Array.from(selectedIds), status });
      toast.success(`Updated ${selectedIds.size} discrepancies`);
      setSelectedIds(new Set());
    } catch (error) {
      toast.error('Failed to update discrepancies');
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateMutation.mutateAsync({
        id: noteDialog.id,
        notes: noteDialog.notes,
      });
      toast.success('Notes saved');
      setNoteDialog({ open: false, id: '', notes: '' });
    } catch (error) {
      toast.error('Failed to save notes');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pending</Badge>;
      case 'reviewed':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Reviewed</Badge>;
      case 'dismissed':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Dismissed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDiffBadge = (diffPct: number | null) => {
    if (diffPct === null) return null;
    const severity = diffPct > 20 ? 'destructive' : diffPct > 10 ? 'secondary' : 'outline';
    return <Badge variant={severity}>{diffPct.toFixed(1)}%</Badge>;
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (discrepancies.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No discrepancies found</div>;
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg mb-4">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => handleBulkUpdate('reviewed')}>
            <Check className="h-4 w-4 mr-1" /> Mark Reviewed
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkUpdate('dismissed')}>
            <X className="h-4 w-4 mr-1" /> Dismiss
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === discrepancies.length && discrepancies.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>Bullaware</TableHead>
              <TableHead>Firecrawl</TableHead>
              <TableHead>Diff</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {discrepancies.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(d.id)}
                    onCheckedChange={(checked) => handleSelectOne(d.id, !!checked)}
                  />
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{d.entity_name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{d.entity_type}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{d.field_name}</code>
                </TableCell>
                <TableCell className="font-mono text-sm">{d.bullaware_value || '-'}</TableCell>
                <TableCell className="font-mono text-sm">{d.firecrawl_value || '-'}</TableCell>
                <TableCell>{getDiffBadge(d.difference_pct)}</TableCell>
                <TableCell>{getStatusBadge(d.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleStatusUpdate(d.id, 'reviewed')}>
                        <Check className="h-4 w-4 mr-2" /> Mark Reviewed
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusUpdate(d.id, 'dismissed')}>
                        <X className="h-4 w-4 mr-2" /> Dismiss
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setNoteDialog({ open: true, id: d.id, notes: d.notes || '' })}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" /> Add Notes
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={noteDialog.open} onOpenChange={(open) => setNoteDialog({ ...noteDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Notes</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteDialog.notes}
            onChange={(e) => setNoteDialog({ ...noteDialog, notes: e.target.value })}
            placeholder="Add your review notes here..."
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog({ open: false, id: '', notes: '' })}>
              Cancel
            </Button>
            <Button onClick={handleSaveNotes}>Save Notes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
