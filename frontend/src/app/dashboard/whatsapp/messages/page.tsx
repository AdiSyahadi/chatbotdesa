"use client";

import { useState, Suspense } from "react";
import { useMessages, useSendMessage, useInstances, useDeleteMessages } from "@/hooks/use-queries";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FileUpload, FileUploadFile, FileType } from "@/components/ui/file-upload";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  RefreshCw,
  Send,
  MessageSquare,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  CheckCheck,
  Clock,
  XCircle,
  Image as ImageIcon,
  Video,
  FileAudio,
  FileText,
  Sticker,
  Download,
  Trash2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { uploadsApi } from "@/lib/api";

// Helper to format phone number from JID
function formatPhoneNumber(jid: string): string {
  if (!jid) return "Unknown";
  // Remove @s.whatsapp.net or @g.us suffix
  const phone = jid.replace(/@[sg]\.whatsapp\.net|@g\.us/gi, "");
  // Format with spaces for readability
  if (phone.length > 10) {
    return `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 9)} ${phone.slice(9)}`;
  }
  return phone || "Unknown";
}

interface Message {
  id: string;
  instance_id: string;
  instance_name?: string;
  chat_jid: string;
  sender_jid?: string;
  direction: "OUTGOING" | "INCOMING";
  message_type: string;
  content: string | { text?: string; caption?: string };
  media_url?: string;
  status: string;
  source?: string;
  created_at: string;
}

interface Instance {
  id: string;
  name: string;
  status: string;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  PENDING: { label: "Pending", icon: <Clock className="h-3 w-3" />, color: "text-yellow-600" },
  SENT: { label: "Sent", icon: <Check className="h-3 w-3" />, color: "text-secondary" },
  DELIVERED: { label: "Delivered", icon: <CheckCheck className="h-3 w-3" />, color: "text-primary" },
  READ: { label: "Read", icon: <CheckCheck className="h-3 w-3" />, color: "text-primary" },
  FAILED: { label: "Failed", icon: <XCircle className="h-3 w-3" />, color: "text-red-600" },
};

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner /></div>}>
      <MessagesPageInner />
    </Suspense>
  );
}

function MessagesPageInner() {
  const searchParams = useSearchParams();
  const defaultInstanceId = searchParams.get("instance") || "";

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterInstanceId, setFilterInstanceId] = useState(defaultInstanceId || "__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterDirection, setFilterDirection] = useState("__all__");
  const [filterSource, setFilterSource] = useState("__all__");
  const [page, setPage] = useState(1);

  // Reset pagination when any filter changes
  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  // Form state
  const [formInstanceId, setFormInstanceId] = useState(defaultInstanceId);
  const [formTo, setFormTo] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formType, setFormType] = useState("text");
  const [formCaption, setFormCaption] = useState("");
  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const { data: instancesData } = useInstances();
  const { data, isLoading, refetch } = useMessages({
    page,
    limit: 20,
    instanceId: filterInstanceId === "__all__" ? undefined : filterInstanceId,
    status: filterStatus === "__all__" ? undefined : filterStatus,
    direction: filterDirection === "__all__" ? undefined : filterDirection,
    source: filterSource === "__all__" ? undefined : filterSource,
  });
  const sendMutation = useSendMessage();
  const deleteMessagesMutation = useDeleteMessages();

  const instances: Instance[] = instancesData?.data || [];
  const messages: Message[] = data?.data || [];
  const pagination = data?.pagination;

  const handleSend = async () => {
    if (!formInstanceId || !formTo) return;
    
    // Validate based on type
    if (formType === "text" && !formMessage) return;
    if (["image", "document", "video", "audio"].includes(formType) && !uploadedFileUrl) return;

    try {
      const content = formType === "text" 
        ? { text: formMessage }
        : { url: uploadedFileUrl, caption: formCaption };

      await sendMutation.mutateAsync({
        instance_id: formInstanceId,
        to: formTo,
        type: formType,
        content,
      });
      setSendDialogOpen(false);
      setFormTo("");
      setFormMessage("");
      setUploadedFileUrl("");
      setFormCaption("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleFileUpload = async (file: File): Promise<{ url: string }> => {
    setIsUploading(true);
    try {
      const result = await uploadsApi.upload(file, formType as FileType);
      setUploadedFileUrl(result.data.url);
      return { url: result.data.url };
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (files: FileUploadFile[]) => {
    if (files.length === 0) {
      setUploadedFileUrl("");
    } else if (files[0]?.url) {
      setUploadedFileUrl(files[0].url);
    }
  };

  const connectedInstances = instances.filter((i) => i.status === "CONNECTED");

  const isAllSelected = messages.length > 0 && messages.every((m) => selectedIds.has(m.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    await deleteMessagesMutation.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
    setDeleteDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground">
            View and send WhatsApp messages
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleteMessagesMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={connectedInstances.length === 0}>
                <Send className="mr-2 h-4 w-4" />
                Send Message
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Send Message</DialogTitle>
                <DialogDescription>
                  Send a WhatsApp message to a contact
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="instance">Instance</Label>
                  <Select
                    value={formInstanceId}
                    onValueChange={setFormInstanceId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select instance" />
                    </SelectTrigger>
                    <SelectContent>
                      {connectedInstances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to">Recipient</Label>
                  <Input
                    id="to"
                    placeholder="628123456789"
                    value={formTo}
                    onChange={(e) => setFormTo(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Phone number with country code (no + or spaces)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Message Type</Label>
                  <Select value={formType} onValueChange={(value) => {
                    setFormType(value);
                    setUploadedFileUrl("");
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio">Audio</SelectItem>
                      <SelectItem value="template">Template</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formType === "text" ? (
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Type your message..."
                      rows={4}
                      value={formMessage}
                      onChange={(e) => setFormMessage(e.target.value)}
                    />
                  </div>
                ) : formType === "template" ? (
                  <div className="space-y-2">
                    <Label htmlFor="message">Template Name</Label>
                    <Input
                      id="message"
                      placeholder="template_name"
                      value={formMessage}
                      onChange={(e) => setFormMessage(e.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Upload {formType.charAt(0).toUpperCase() + formType.slice(1)}</Label>
                      <FileUpload
                        accept={formType as FileType}
                        onUpload={handleFileUpload}
                        onChange={handleFileChange}
                        disabled={isUploading}
                      />
                      {uploadedFileUrl && (
                        <p className="text-xs text-secondary">
                          File uploaded successfully
                        </p>
                      )}
                    </div>
                    {formType !== "audio" && (
                      <div className="space-y-2">
                        <Label htmlFor="caption">Caption (optional)</Label>
                        <Textarea
                          id="caption"
                          placeholder="Add a caption..."
                          rows={2}
                          value={formCaption}
                          onChange={(e) => setFormCaption(e.target.value)}
                        />
                      </div>
                    )}
                    {formType === "audio" && (
                      <p className="text-xs text-muted-foreground">
                        Note: WhatsApp does not support captions for audio messages
                      </p>
                    )}
                  </>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSendDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={
                    sendMutation.isPending ||
                    isUploading ||
                    !formInstanceId ||
                    !formTo ||
                    (formType === "text" ? !formMessage : formType === "template" ? !formMessage : !uploadedFileUrl)
                  }
                >
                  {sendMutation.isPending && (
                    <Spinner size="sm" className="mr-2" />
                  )}
                  Send Message
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <Label className="text-xs text-muted-foreground">Instance</Label>
              <Select
                value={filterInstanceId}
                onValueChange={handleFilterChange(setFilterInstanceId)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All instances" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All instances</SelectItem>
                  {instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={handleFilterChange(setFilterStatus)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="READ">Read</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Direction</Label>
              <Select
                value={filterDirection}
                onValueChange={handleFilterChange(setFilterDirection)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All directions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All directions</SelectItem>
                  <SelectItem value="OUTGOING">Sent</SelectItem>
                  <SelectItem value="INCOMING">Received</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Select value={filterSource} onValueChange={handleFilterChange(setFilterSource)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All sources</SelectItem>
                  <SelectItem value="REALTIME">Real-time</SelectItem>
                  <SelectItem value="HISTORY_SYNC">History Sync</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No messages yet</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-sm">
              {filterInstanceId || filterStatus || filterDirection
                ? "No messages match your filters. Try adjusting them."
                : "Start by sending your first message."}
            </p>
            <Button
              onClick={() => setSendDialogOpen(true)}
              disabled={connectedInstances.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Send Message
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-36">Contact</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-24">Instance</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24">Source</TableHead>
                  <TableHead className="w-28">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message) => {
                  const status = statusConfig[message.status] || statusConfig.PENDING;
                  return (
                    <TableRow key={message.id} className={selectedIds.has(message.id) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(message.id)}
                          onCheckedChange={() => toggleSelect(message.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell>
                        {message.direction === "OUTGOING" ? (
                          <ArrowUpRight className="h-4 w-4 text-secondary" />
                        ) : (
                          <ArrowDownLeft className="h-4 w-4 text-accent" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium truncate">
                        {formatPhoneNumber(message.chat_jid)}
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        {(() => {
                          const textContent = typeof message.content === "string"
                            ? message.content
                            : message.content?.text || message.content?.caption || "";
                          const mediaType = message.message_type?.toUpperCase();
                          const mediaUrl = message.media_url;

                          // Media rendering based on message_type
                          if (mediaUrl && (mediaType === "IMAGE" || mediaType === "STICKER")) {
                            return (
                              <div className="space-y-1">
                                <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={mediaUrl}
                                    alt={textContent || "Image"}
                                    className="max-h-20 max-w-32 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </a>
                                {textContent && <p className="text-sm truncate">{textContent}</p>}
                              </div>
                            );
                          }
                          if (mediaUrl && mediaType === "VIDEO") {
                            return (
                              <div className="space-y-1">
                                <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-secondary hover:underline">
                                  <Video className="h-4 w-4" />
                                  Video
                                </a>
                                {textContent && <p className="text-sm truncate">{textContent}</p>}
                              </div>
                            );
                          }
                          if (mediaUrl && mediaType === "AUDIO") {
                            return (
                              <audio controls className="h-8 max-w-48" preload="none">
                                <source src={mediaUrl} />
                              </audio>
                            );
                          }
                          if (mediaUrl && mediaType === "DOCUMENT") {
                            return (
                              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-secondary hover:underline">
                                <FileText className="h-4 w-4" />
                                {textContent || "Document"}
                                <Download className="h-3 w-3" />
                              </a>
                            );
                          }

                          // Text-only message or media without URL
                          if (mediaType && mediaType !== "TEXT" && !mediaUrl) {
                            const icons: Record<string, React.ReactNode> = {
                              IMAGE: <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />,
                              VIDEO: <Video className="h-3.5 w-3.5 text-muted-foreground" />,
                              AUDIO: <FileAudio className="h-3.5 w-3.5 text-muted-foreground" />,
                              DOCUMENT: <FileText className="h-3.5 w-3.5 text-muted-foreground" />,
                              STICKER: <Sticker className="h-3.5 w-3.5 text-muted-foreground" />,
                            };
                            return (
                              <span className="inline-flex items-center gap-1 text-sm truncate">
                                {icons[mediaType]}
                                {textContent || `[${mediaType}]`}
                              </span>
                            );
                          }

                          return <span className="block truncate">{textContent || "[Empty]"}</span>;
                        })()}
                      </TableCell>
                      <TableCell className="truncate">
                        <span className="text-sm text-muted-foreground">
                          {message.instance_name || message.instance_id.substring(0, 8)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("gap-1", status.color)}
                        >
                          {status.icon}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            message.source === "HISTORY_SYNC"
                              ? "border-purple-200 text-purple-700 bg-purple-50"
                              : "border-secondary/30 text-secondary bg-secondary/5"
                          )}
                        >
                          {message.source === "HISTORY_SYNC" ? "Synced" : "Real-time"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(message.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          {/* Pagination */}
          {pagination && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {messages.length} of {pagination.total} messages
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pagination.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.total_pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
      {/* Bulk delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Pesan</DialogTitle>
            <DialogDescription>
              Anda akan menghapus <strong>{selectedIds.size} pesan</strong> secara permanen. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleteMessagesMutation.isPending}
            >
              {deleteMessagesMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
