'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, uploadWithProgress } from '@/lib/api';
import { UploadWidget, UploadTask } from '@/components/UploadWidget';
import { useToast } from '@/components/Toast';
import styles from './dashboard.module.css';
import {
  Folder as FolderIcon,
  File as FileIcon,
  Trash2,
  Settings,
  LogOut,
  Upload,
  FolderPlus,
  ArrowLeft,
  Search,
  Download,
  RotateCcw,
  AlertCircle,
  FileText,
  Image,
  Video,
  Music,
  User as UserIcon,
  MoreVertical,
  Trash,
  Cloud,
  Sparkles,
  Bell,
  HelpCircle,
  Clock,
  Users,
  Zap,
  Star,
  Copy,
  MoreHorizontal,
  Share2,
  Link,
  X,
  Lock,
  Globe
} from 'lucide-react';

interface FileItem {
  id: string;
  fileName: string;
  s3Key: string;
  userId?: string;
  sizeBytes: number;
  fileType: 'image' | 'video' | 'audio' | 'document' | 'other';
  createdAt: string;
  isStarred?: boolean;
  lastAccessedAt?: string;
}

interface FolderItem {
  id: string;
  name: string;
  userId?: string;
  parentFolderId: string | null;
  isStarred?: boolean;
  lastAccessedAt?: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  isTwoFactorEnabled: boolean;
}

interface BatchFileEntry {
  file: File;
  relativePath: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'drive' | 'starred' | 'recent' | 'shared' | 'trash' | 'settings'>('drive');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Storage usage states
  const [storageUsed, setStorageUsed] = useState(0);
  const quotaBytes = 500 * 1024 * 1024; // 500 MB quota

  // Drive explorer states
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderItem[]>([]);
  
  // Starred & Recent items states
  const [starredFolders, setStarredFolders] = useState<FolderItem[]>([]);
  const [starredFiles, setStarredFiles] = useState<FileItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Trashed items states
  const [currentTrashedFolderId, setCurrentTrashedFolderId] = useState<string | null>(null);
  const [trashedBreadcrumbs, setTrashedBreadcrumbs] = useState<FolderItem[]>([]);
  const [trashedFolders, setTrashedFolders] = useState<FolderItem[]>([]);
  const [trashedFiles, setTrashedFiles] = useState<FileItem[]>([]);

  // Shared items states
  const [sharedFolders, setSharedFolders] = useState<any[]>([]);
  const [sharedFiles, setSharedFiles] = useState<any[]>([]);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);

  // Share Modal states
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'VIEWER' | 'EDITOR'>('VIEWER');
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [isPublicLinkEnabled, setIsPublicLinkEnabled] = useState(false);
  const [canEditCurrentFolder, setCanEditCurrentFolder] = useState(true);

  // Search & Dialog UI states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ folders: FolderItem[], files: FileItem[] } | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Loading & Drag-and-Drop states
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Drag and Drop re-parenting states
  const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'file' | 'folder'; name: string } | null>(null);
  const [activeDropTargetId, setActiveDropTargetId] = useState<string | null>(null);

  // Multi-selection & Marquee states
  const [selectedItems, setSelectedItems] = useState<Map<string, { id: string; type: 'file' | 'folder'; name: string }>>(new Map());
  const [lastSelectedItem, setLastSelectedItem] = useState<{ id: string; type: 'file' | 'folder' } | null>(null);
  const [isMarquee, setIsMarquee] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);

  const filteredFolders = searchQuery.trim() !== ''
    ? (searchResults?.folders || [])
    : folders;

  const filteredFiles = searchQuery.trim() !== ''
    ? (searchResults?.files || [])
    : files;

  // Authenticate user on mount via HttpOnly Cookie (or localStorage fallback)
  useEffect(() => {
    const verifySession = async () => {
      try {
        const user = await apiFetch('/auth/me');
        setCurrentUser(user);
      } catch {
        showToast('Please sign in to access your drive.', 'error');
        router.push('/login');
      }
    };

    verifySession();
  }, [router, showToast]);

  // Close active dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Clear item selection and dropdown menu when navigating folders or switching tabs
  useEffect(() => {
    setSelectedItems(new Map());
    setActiveMenuId(null);
  }, [currentFolderId, activeTab]);

  // Helper to compute badge, background color, and icon for Quick Access bento cards
  const getFileBadgeInfo = (fileName: string, fileType: string) => {
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toUpperCase() : 'FILE';
    if (fileType === 'image' || ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG'].includes(ext)) {
      return { badge: ext || 'IMG', bg: 'rgba(0, 94, 151, 0.08)', color: '#005e97', icon: <Image size={42} style={{ color: '#005e97', opacity: 0.8 }} /> };
    }
    if (ext === 'PDF') {
      return { badge: 'PDF', bg: 'rgba(186, 26, 26, 0.08)', color: '#ba1a1a', icon: <FileText size={42} style={{ color: '#ba1a1a', opacity: 0.8 }} /> };
    }
    if (fileType === 'video' || ['MP4', 'MOV', 'AVI', 'KEY'].includes(ext)) {
      return { badge: ext || 'VIDEO', bg: 'rgba(252, 138, 64, 0.12)', color: '#9b4500', icon: <Video size={42} style={{ color: '#9b4500', opacity: 0.8 }} /> };
    }
    if (['XLS', 'XLSX', 'CSV'].includes(ext)) {
      return { badge: ext, bg: 'rgba(16, 185, 129, 0.08)', color: '#10b981', icon: <FileIcon size={42} style={{ color: '#10b981', opacity: 0.8 }} /> };
    }
    return { badge: ext, bg: 'rgba(112, 120, 130, 0.08)', color: '#707882', icon: <FileIcon size={42} style={{ color: '#707882', opacity: 0.8 }} /> };
  };

  // Load drive contents or trash depending on active state
  useEffect(() => {
    if (!currentUser) return;

    setSearchQuery('');
    setSearchResults(null);

    if (activeTab !== 'drive') {
      setCurrentFolderId('root');
    }
    if (activeTab !== 'trash') {
      setCurrentTrashedFolderId(null);
    }

    if (activeTab === 'drive') {
      fetchFolderContents();
      fetchBreadcrumbs();
    } else if (activeTab === 'starred') {
      fetchStarredItems();
    } else if (activeTab === 'recent') {
      fetchRecentFiles();
    } else if (activeTab === 'shared') {
      fetchSharedItems();
    } else if (activeTab === 'trash') {
      fetchTrashedItems();
    }
    fetchQuotaUsage();
  }, [activeTab, currentFolderId, currentTrashedFolderId, currentUser]);

  // Search effect (debounced global search)
  useEffect(() => {
    if (!currentUser) return;
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/files/search?query=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data);
      } catch (err: any) {
        showToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, currentUser, showToast]);

  // Fetch current folder contents
  const fetchFolderContents = async () => {
    setLoading(true);
    try {
      const path = currentFolderId === 'root' 
        ? '/files/folders/content' 
        : `/files/folders/content/${currentFolderId}`;
      
      const data = await apiFetch(path);
      setCurrentFolder(data.currentFolder);
      setFolders(data.folders || []);
      setFiles(data.files || []);
      setCanEditCurrentFolder(data.canEdit !== undefined ? data.canEdit : true);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch breadcrumb list
  const fetchBreadcrumbs = async () => {
    if (currentFolderId === 'root') {
      setBreadcrumbs([]);
      return;
    }
    try {
      const data = await apiFetch(`/files/folders/${currentFolderId}/breadcrumbs`);
      setBreadcrumbs(data || []);
    } catch (err) {
      console.error('Error fetching breadcrumbs:', err);
    }
  };

  // Fetch total quota usage (includes active and trashed files)
  const fetchQuotaUsage = async () => {
    try {
      const data = await apiFetch('/files/storage/usage');
      setStorageUsed(data.usedBytes);
    } catch (err) {
      console.error('Error calculating quota usage:', err);
    }
  };

  // Fetch starred items
  const fetchStarredItems = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/files/starred');
      setStarredFolders(data.folders || []);
      setStarredFiles(data.files || []);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch recent files
  const fetchRecentFiles = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/files/recent');
      setRecentFiles(data || []);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch items shared with the user
  const fetchSharedItems = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/files/shares/shared-with-me');
      setSharedFolders(data.folders || []);
      setSharedFiles(data.files || []);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Open Share Modal
  const handleOpenShareModal = async (item: { id: string; name: string; type: 'file' | 'folder' }) => {
    setShareTarget(item);
    setShowShareModal(true);
    setShareEmail('');
    setShareRole('VIEWER');
    setShareLoading(true);
    try {
      const [collabs, linkData] = await Promise.all([
        apiFetch(`/files/shares/item/${item.type}/${item.id}`),
        apiFetch('/files/shares/link', {
          method: 'POST',
          body: JSON.stringify({ itemId: item.id, itemType: item.type }),
        }),
      ]);
      setCollaborators(collabs || []);
      setIsPublicLinkEnabled(linkData?.isPublicLinkEnabled || false);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setShareLoading(false);
    }
  };

  // Toggle General Access setting (Restricted vs Anyone with the link)
  const handleToggleGeneralAccess = async (enabled: boolean) => {
    if (!shareTarget) return;
    try {
      await apiFetch('/files/shares/link-access', {
        method: 'PATCH',
        body: JSON.stringify({
          itemId: shareTarget.id,
          itemType: shareTarget.type,
          isPublicLinkEnabled: enabled,
        }),
      });
      setIsPublicLinkEnabled(enabled);
      showToast(`General access updated to ${enabled ? 'Anyone with the link' : 'Restricted'}`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Submit Share Item
  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTarget || !shareEmail.trim()) return;

    setShareLoading(true);
    try {
      await apiFetch('/files/shares', {
        method: 'POST',
        body: JSON.stringify({
          itemId: shareTarget.id,
          itemType: shareTarget.type,
          email: shareEmail.trim(),
          role: shareRole,
        }),
      });
      showToast(`Shared "${shareTarget.name}" with ${shareEmail.trim()}`, 'success');
      setShareEmail('');
      const data = await apiFetch(`/files/shares/item/${shareTarget.type}/${shareTarget.id}`);
      setCollaborators(data || []);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setShareLoading(false);
    }
  };

  // Update Collaborator Role
  const handleUpdateShareRole = async (shareId: string, role: 'VIEWER' | 'EDITOR') => {
    try {
      await apiFetch(`/files/shares/${shareId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      showToast('Permissions updated', 'success');
      setCollaborators(collaborators.map((c) => (c.id === shareId ? { ...c, role } : c)));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Revoke Share
  const handleRevokeShare = async (shareId: string) => {
    try {
      await apiFetch(`/files/shares/${shareId}`, { method: 'DELETE' });
      showToast('Collaborator access revoked', 'success');
      setCollaborators(collaborators.filter((c) => c.id !== shareId));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Helper to check if current user is owner of an item
  const isItemOwner = (item: { userId?: string }) => {
    if (!currentUser) return true;
    if (!item.userId) return true;
    return item.userId === currentUser.id;
  };

  // Copy Share Link
  const handleCopyShareLink = async () => {
    if (!shareTarget) return;
    try {
      const data = await apiFetch('/files/shares/link', {
        method: 'POST',
        body: JSON.stringify({ itemId: shareTarget.id, itemType: shareTarget.type }),
      });
      const fullUrl = `${window.location.origin}${data.linkUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      showToast('Share link copied to clipboard!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Toggle Star on File
  const handleToggleStarFile = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/files/${fileId}/star`, { method: 'PATCH' });
      showToast(res.message, 'success');
      if (activeTab === 'drive') fetchFolderContents();
      if (activeTab === 'starred') fetchStarredItems();
      if (activeTab === 'recent') fetchRecentFiles();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Toggle Star on Folder
  const handleToggleStarFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/files/folders/${folderId}/star`, { method: 'PATCH' });
      showToast(res.message, 'success');
      if (activeTab === 'drive') fetchFolderContents();
      if (activeTab === 'starred') fetchStarredItems();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Duplicate File (Make a Copy)
  const handleDuplicateFile = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    setActiveMenuId(null);
    try {
      const res = await apiFetch(`/files/${fileId}/copy`, { method: 'POST' });
      showToast(res.message, 'success');
      fetchQuotaUsage();
      if (activeTab === 'drive') fetchFolderContents();
      if (activeTab === 'starred') fetchStarredItems();
      if (activeTab === 'recent') fetchRecentFiles();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Fetch trashed items
  const fetchTrashedItems = async () => {
    setLoading(true);
    try {
      const path = currentTrashedFolderId
        ? `/files/folders/content-trashed/${currentTrashedFolderId}`
        : '/files/trash/all';

      const data = await apiFetch(path);
      setTrashedFolders(data.folders || []);
      setTrashedFiles(data.files || []);

      // Fetch trashed folder breadcrumbs if inside a folder
      if (currentTrashedFolderId) {
        const crumbs = await apiFetch(`/files/folders/${currentTrashedFolderId}/breadcrumbs-trashed`);
        setTrashedBreadcrumbs(crumbs || []);
      } else {
        setTrashedBreadcrumbs([]);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Upload single file binary helper
  const uploadSingleFileBinary = async (file: File, targetFolderId: string | null): Promise<boolean> => {
    if (file.size > 50 * 1024 * 1024) {
      showToast(`File "${file.name}" exceeds 50 MB size limit. Skipped.`, 'error');
      return false;
    }

    const taskId = crypto.randomUUID();
    const newTask: UploadTask = {
      id: taskId,
      fileName: file.name,
      sizeBytes: file.size,
      uploadedBytes: 0,
      percent: 0,
      status: 'uploading',
    };
    setUploadTasks((prev) => [newTask, ...prev]);

    try {
      const presignedData = await apiFetch('/files/presigned-upload', {
        method: 'POST',
        bodyData: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          folderId: !targetFolderId || targetFolderId === 'root' ? null : targetFolderId,
        },
      });

      await uploadWithProgress(
        presignedData.uploadUrl,
        file,
        file.type || 'application/octet-stream',
        (percent, loadedBytes) => {
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, percent, uploadedBytes: loadedBytes } : t))
          );
        }
      );

      await apiFetch(`/files/confirm-upload/${presignedData.fileId}`, {
        method: 'POST',
      });

      setUploadTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, percent: 100, uploadedBytes: file.size, status: 'completed' } : t))
      );

      return true;
    } catch (err: any) {
      console.error(`Upload error for ${file.name}:`, err);
      setUploadTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'error', errorMsg: err.message || `Failed to upload ${file.name}` } : t))
      );
      showToast(err.message || `Failed to upload ${file.name}`, 'error');
      return false;
    }
  };

  // Upload batch of files while maintaining folder hierarchy
  const uploadBatchFilesWithStructure = async (entries: BatchFileEntry[], baseFolderId: string | null) => {
    if (entries.length === 0) return;

    setLoading(true);

    const folderPathCache = new Map<string, string | null>();
    let successCount = 0;

    for (let i = 0; i < entries.length; i++) {
      const { file, relativePath } = entries[i];
      const normalizedPath = relativePath.replace(/\\/g, '/');
      const pathParts = normalizedPath.split('/').filter(p => p.trim() !== '');
      const folderSegments = pathParts.slice(0, -1);

      let destFolderId: string | null = !baseFolderId || baseFolderId === 'root' ? null : baseFolderId;

      if (folderSegments.length > 0) {
        const cacheKey = folderSegments.join('/');
        if (folderPathCache.has(cacheKey)) {
          destFolderId = folderPathCache.get(cacheKey)!;
        } else {
          try {
            const res = await apiFetch('/files/folders/ensure-path', {
              method: 'POST',
              bodyData: {
                path: folderSegments,
                parentFolderId: destFolderId,
              },
            });
            destFolderId = res.folderId;
            folderPathCache.set(cacheKey, destFolderId);
          } catch (err) {
            console.error('Error creating nested folder hierarchy:', err);
          }
        }
      }

      const ok = await uploadSingleFileBinary(file, destFolderId);
      if (ok) successCount++;
    }

    setLoading(false);
    fetchFolderContents();
    fetchQuotaUsage();
  };

  // Handle file upload trigger
  const handleFileUpload = async (filesToUpload: FileList | null) => {
    if (!canEditCurrentFolder) {
      showToast('You have Viewer permissions for this folder and cannot upload files.', 'error');
      return;
    }
    if (!filesToUpload || filesToUpload.length === 0) return;
    const entries: BatchFileEntry[] = Array.from(filesToUpload).map(file => ({
      file,
      relativePath: file.name,
    }));
    await uploadBatchFilesWithStructure(entries, currentFolderId);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle folder upload from input picker (webkitdirectory)
  const handleFolderInputChange = async (filesToUpload: FileList | null) => {
    if (!canEditCurrentFolder) {
      showToast('You have Viewer permissions for this folder and cannot upload files.', 'error');
      return;
    }
    if (!filesToUpload || filesToUpload.length === 0) return;
    const entries: BatchFileEntry[] = Array.from(filesToUpload).map(file => ({
      file,
      relativePath: (file as any).webkitRelativePath || file.name,
    }));
    await uploadBatchFilesWithStructure(entries, currentFolderId);
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  // Helper to scan directory entries recursively during drag-and-drop
  const scanDirectoryEntry = async (entry: any, path: string = ''): Promise<BatchFileEntry[]> => {
    const results: BatchFileEntry[] = [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => {
          results.push({ file, relativePath: path + file.name });
          resolve(results);
        }, () => resolve(results));
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readEntries = async (): Promise<any[]> => {
        let entriesList: any[] = [];
        let read = await new Promise<any[]>((res) => dirReader.readEntries(res, () => res([])));
        while (read.length > 0) {
          entriesList = entriesList.concat(read);
          read = await new Promise<any[]>((res) => dirReader.readEntries(res, () => res([])));
        }
        return entriesList;
      };

      const childEntries = await readEntries();
      for (const child of childEntries) {
        const childResults = await scanDirectoryEntry(child, path + entry.name + '/');
        results.push(...childResults);
      }
    }
    return results;
  };

  // External File Upload Drag & Drop handlers (from Desktop OS)
  const handleExternalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedItem) return; // Ignore when dragging internal items

    const isFile = e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');
    if (!isFile) return;

    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleExternalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem) return;

    const isFile = e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');
    if (isFile) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleExternalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem) return;

    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragActive(false);
    }
  };

  const handleExternalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);

    if (draggedItem) return;

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const batchEntries: BatchFileEntry[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            const scanned = await scanDirectoryEntry(entry, '');
            batchEntries.push(...scanned);
          } else {
            const file = item.getAsFile();
            if (file) {
              batchEntries.push({ file, relativePath: file.name });
            }
          }
        }
      }

      if (batchEntries.length > 0) {
        uploadBatchFilesWithStructure(batchEntries, currentFolderId);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const batchEntries: BatchFileEntry[] = Array.from(e.dataTransfer.files).map(file => ({
        file,
        relativePath: (file as any).webkitRelativePath || file.name,
      }));
      uploadBatchFilesWithStructure(batchEntries, currentFolderId);
    }
  };

  // Create folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setLoading(true);
    try {
      await apiFetch('/files/folders', {
        method: 'POST',
        bodyData: {
          name: newFolderName,
          parentFolderId: currentFolderId === 'root' ? undefined : currentFolderId,
        },
      });
      showToast('Folder created successfully!', 'success');
      setNewFolderName('');
      setShowFolderModal(false);
      fetchFolderContents();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Toggle 2FA switch setting
  const handleToggle2FA = async () => {
    if (!currentUser) return;
    const targetState = !currentUser.isTwoFactorEnabled;

    setLoading(true);
    try {
      const response = await apiFetch('/auth/2fa/toggle', {
        method: 'POST',
        bodyData: { enable: targetState },
      });
      
      const updatedUser = { ...currentUser, isTwoFactorEnabled: targetState };
      setCurrentUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      showToast(response.message || '2FA settings updated!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // File download streaming
  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await apiFetch(`/files/download/${fileId}`);
      const blob = await response.blob();
      
      // Create temporary download link anchor
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Soft delete (move to trash)
  const handleTrashFile = async (fileId: string) => {
    try {
      await apiFetch(`/files/${fileId}/trash`, { method: 'PATCH' });
      showToast('File moved to trash.', 'success');
      fetchFolderContents();
      fetchQuotaUsage();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleTrashFolder = async (folderId: string) => {
    try {
      await apiFetch(`/files/folders/${folderId}/trash`, { method: 'PATCH' });
      showToast('Folder moved to trash.', 'success');
      fetchFolderContents();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Bulk actions for multi-selection
  const handleBulkTrash = async () => {
    if (selectedItems.size === 0) return;
    const items = Array.from(selectedItems.values());
    try {
      await Promise.all(
        items.map((item) =>
          item.type === 'file'
            ? apiFetch(`/files/${item.id}/trash`, { method: 'PATCH' })
            : apiFetch(`/files/folders/${item.id}/trash`, { method: 'PATCH' })
        )
      );
      showToast(`${items.length} item${items.length > 1 ? 's' : ''} moved to trash.`, 'success');
      setSelectedItems(new Map());
      setActiveMenuId(null);
      fetchFolderContents();
      fetchQuotaUsage();
    } catch (err: any) {
      showToast(err.message || 'Failed to trash selected items.', 'error');
    }
  };

  const handleBulkStar = async () => {
    if (selectedItems.size === 0) return;
    const items = Array.from(selectedItems.values());
    const allStarred = items.every((item) => {
      if (item.type === 'file') {
        return files.find((f) => f.id === item.id)?.isStarred;
      } else {
        return folders.find((f) => f.id === item.id)?.isStarred;
      }
    });

    try {
      await Promise.all(
        items.map((item) =>
          item.type === 'file'
            ? apiFetch(`/files/${item.id}/star`, {
                method: 'PATCH',
                body: JSON.stringify({ isStarred: !allStarred }),
              })
            : apiFetch(`/files/folders/${item.id}/star`, {
                method: 'PATCH',
                body: JSON.stringify({ isStarred: !allStarred }),
              })
        )
      );
      showToast(`${items.length} item${items.length > 1 ? 's' : ''} ${allStarred ? 'unstarred' : 'starred'}.`, 'success');
      setActiveMenuId(null);
      fetchFolderContents();
      fetchStarredItems();
    } catch (err: any) {
      showToast(err.message || 'Failed to update star status.', 'error');
    }
  };

  const handleBulkDownload = async () => {
    if (selectedItems.size === 0) return;
    const selectedFiles = Array.from(selectedItems.values()).filter((i) => i.type === 'file');
    if (selectedFiles.length === 0) {
      showToast('No downloadable files selected.', 'info');
      return;
    }
    setActiveMenuId(null);
    for (const f of selectedFiles) {
      handleDownload(f.id, f.name);
    }
  };

  // Item click selection handler (single, Ctrl/Cmd toggle, Shift range)
  const handleItemSelectClick = (
    e: React.MouseEvent,
    item: { id: string; type: 'file' | 'folder'; name: string },
    allVisibleItems: Array<{ id: string; type: 'file' | 'folder'; name: string }>
  ) => {
    e.stopPropagation();
    setActiveMenuId(null);

    if (e.ctrlKey || e.metaKey) {
      setSelectedItems((prev) => {
        const next = new Map(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          next.set(item.id, item);
        }
        return next;
      });
      setLastSelectedItem(item);
    } else if (e.shiftKey && lastSelectedItem) {
      const lastIdx = allVisibleItems.findIndex((i) => i.id === lastSelectedItem.id);
      const currentIdx = allVisibleItems.findIndex((i) => i.id === item.id);
      if (lastIdx !== -1 && currentIdx !== -1) {
        const start = Math.min(lastIdx, currentIdx);
        const end = Math.max(lastIdx, currentIdx);
        const range = allVisibleItems.slice(start, end + 1);
        setSelectedItems((prev) => {
          const next = new Map(prev);
          range.forEach((i) => next.set(i.id, i));
          return next;
        });
      }
    } else {
      setSelectedItems(new Map([[item.id, item]]));
      setLastSelectedItem(item);
    }
  };

  // Right-click context menu handler on item
  const handleItemContextMenu = (
    e: React.MouseEvent,
    item: { id: string; type: 'file' | 'folder'; name: string }
  ) => {
    e.preventDefault();
    e.stopPropagation();

    setSelectedItems((prev) => {
      if (!prev.has(item.id)) {
        return new Map([[item.id, item]]);
      }
      return prev;
    });
    setLastSelectedItem(item);
    setActiveMenuId(activeMenuId === item.id ? null : item.id);
  };

  // Marquee drag selection event handlers
  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (
      target.closest(`.${styles.folderCard}`) ||
      target.closest(`.${styles.fileRow}`) ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('a')
    ) {
      return;
    }

    setActiveMenuId(null);

    if (!e.ctrlKey && !e.metaKey) {
      setSelectedItems(new Map());
    }

    if (!contentAreaRef.current) return;
    const rect = contentAreaRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left + contentAreaRef.current.scrollLeft;
    const startY = e.clientY - rect.top + contentAreaRef.current.scrollTop;

    setIsMarquee(true);
    setMarqueeBox({ startX, startY, currentX: startX, currentY: startY });
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (!isMarquee || !contentAreaRef.current || !marqueeBox) return;

    const rect = contentAreaRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left + contentAreaRef.current.scrollLeft;
    const currentY = e.clientY - rect.top + contentAreaRef.current.scrollTop;

    setMarqueeBox((prev) => (prev ? { ...prev, currentX, currentY } : null));

    const boxLeft = Math.min(marqueeBox.startX, currentX);
    const boxTop = Math.min(marqueeBox.startY, currentY);
    const boxWidth = Math.abs(currentX - marqueeBox.startX);
    const boxHeight = Math.abs(currentY - marqueeBox.startY);

    const elements = contentAreaRef.current.querySelectorAll('[data-selectable-id]');
    const newlySelected = new Map(e.ctrlKey || e.metaKey ? selectedItems : []);

    elements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const itemLeft = htmlEl.offsetLeft;
      const itemTop = htmlEl.offsetTop;
      const itemWidth = htmlEl.offsetWidth;
      const itemHeight = htmlEl.offsetHeight;

      const intersects = !(
        itemLeft + itemWidth < boxLeft ||
        boxLeft + boxWidth < itemLeft ||
        itemTop + itemHeight < boxTop ||
        boxTop + boxHeight < itemTop
      );

      const itemId = htmlEl.getAttribute('data-selectable-id');
      const itemType = htmlEl.getAttribute('data-selectable-type') as 'file' | 'folder';
      const itemName = htmlEl.getAttribute('data-selectable-name') || '';

      if (intersects && itemId && itemType) {
        newlySelected.set(itemId, { id: itemId, type: itemType, name: itemName });
      }
    });

    setSelectedItems(newlySelected);
  };

  const handleContainerMouseUp = () => {
    if (isMarquee) {
      setIsMarquee(false);
      setMarqueeBox(null);
    }
  };

  // Global Keyboard Shortcuts (Esc to deselect, Ctrl+A to select all visible)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'Escape') {
        setSelectedItems(new Map());
        setActiveMenuId(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && activeTab === 'drive') {
        e.preventDefault();
        const allVisible = [
          ...filteredFolders.map((f) => ({ id: f.id, type: 'folder' as const, name: f.name })),
          ...filteredFiles.map((f) => ({ id: f.id, type: 'file' as const, name: f.fileName })),
        ];
        const newMap = new Map();
        allVisible.forEach((item) => newMap.set(item.id, item));
        setSelectedItems(newMap);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredFolders, filteredFiles, activeTab]);

  // Restores from trash
  const handleRestoreFile = async (fileId: string) => {
    try {
      await apiFetch(`/files/${fileId}/restore`, { method: 'PATCH' });
      showToast('File successfully restored!', 'success');
      fetchTrashedItems();
      fetchQuotaUsage();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRestoreFolder = async (folderId: string) => {
    try {
      await apiFetch(`/files/folders/${folderId}/restore`, { method: 'PATCH' });
      showToast('Folder successfully restored!', 'success');
      fetchTrashedItems();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Empty all items from trash bin permanently
  const handleEmptyTrash = () => {
    setShowConfirmModal(true);
  };

  const confirmEmptyTrash = async () => {
    setLoading(true);
    try {
      await apiFetch('/files/trash/empty', { method: 'DELETE' });
      showToast('Trash permanently cleared.', 'success');
      fetchTrashedItems();
      fetchQuotaUsage();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Log Out
  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.clear();
      showToast('Signed out successfully.', 'success');
      window.location.href = '/login';
    }
  };

  // Drag and Drop item re-parenting handlers
  const handleDragStartItem = (e: React.DragEvent, id: string, type: 'file' | 'folder', name: string) => {
    e.stopPropagation();
    setDraggedItem({ id, type, name });
    e.dataTransfer.setData('application/json', JSON.stringify({ id, type, name }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEndItem = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedItem(null);
    setActiveDropTargetId(null);
    dragCounter.current = 0;
    setDragActive(false);
  };

  const handleDragOverTarget = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem) return;

    // Proactive UX: Block self-target folder drop
    if (draggedItem.type === 'folder' && draggedItem.id === targetFolderId) {
      e.dataTransfer.dropEffect = 'none';
      if (activeDropTargetId !== null) {
        setActiveDropTargetId(null);
      }
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    if (activeDropTargetId !== targetFolderId) {
      setActiveDropTargetId(targetFolderId);
    }
  };

  const handleDragLeaveTarget = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDropTargetId(null);
  };

  const handleDropOnTarget = async (e: React.DragEvent, targetFolderId: string | null, targetFolderName?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDropTargetId(null);

    if (!draggedItem) return;
    const { id, type, name } = draggedItem;
    setDraggedItem(null);

    // Proactive UX: Silent return if dropped on itself
    if (type === 'folder' && id === targetFolderId) {
      return;
    }

    try {
      const endpoint = type === 'file' ? `/files/${id}/move` : `/files/folders/${id}/move`;
      await apiFetch(endpoint, {
        method: 'PATCH',
        bodyData: { targetFolderId: targetFolderId === 'root' ? null : targetFolderId },
      });

      const destination = targetFolderName || (targetFolderId === 'root' || targetFolderId === null ? 'My Drive' : 'folder');
      showToast(`Moved "${name}" to ${destination}`, 'success');

      if (activeTab === 'drive') {
        fetchFolderContents();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to move item', 'error');
    }
  };

  // Format bytes helper
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Render type icon
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image size={20} style={{ color: '#3b82f6' }} />;
      case 'video': return <Video size={20} style={{ color: '#ef4444' }} />;
      case 'audio': return <Music size={20} style={{ color: '#10b981' }} />;
      case 'document': return <FileText size={20} style={{ color: '#f59e0b' }} />;
      default: return <FileIcon size={20} style={{ color: '#9ca3af' }} />;
    }
  };

  const quotaPercent = Math.min(100, (storageUsed / quotaBytes) * 100);

  return (
    <div className={styles.container}>
      {/* 1. Sidebar Panel */}
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <Cloud size={24} />
            </div>
            <div className={styles.brandText}>
              <h1 className={styles.logo}>Aether</h1>
              <span className={styles.subLogo}>BenzDrive Storage</span>
            </div>
          </div>

          <nav className={styles.nav}>
            <button
              onClick={() => { setActiveTab('drive'); setCurrentFolderId('root'); }}
              className={`${styles.navLink} ${activeTab === 'drive' ? styles.activeNavLink : ''}`}
            >
              <FolderIcon size={18} />
              <span>My Files</span>
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`${styles.navLink} ${activeTab === 'recent' ? styles.activeNavLink : ''}`}
            >
              <Clock size={18} />
              <span>Recent</span>
            </button>
            <button
              onClick={() => setActiveTab('starred')}
              className={`${styles.navLink} ${activeTab === 'starred' ? styles.activeNavLink : ''}`}
            >
              <Star size={18} />
              <span>Starred</span>
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`${styles.navLink} ${activeTab === 'shared' ? styles.activeNavLink : ''}`}
            >
              <Users size={18} />
              <span>Shared</span>
            </button>
            <button
              onClick={() => setActiveTab('trash')}
              className={`${styles.navLink} ${activeTab === 'trash' ? styles.activeNavLink : ''}`}
            >
              <Trash2 size={18} />
              <span>Trash Bin</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`${styles.navLink} ${activeTab === 'settings' ? styles.activeNavLink : ''}`}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <div>
          {/* Storage Quota bar */}
          <div className={styles.quotaContainer}>
            <div className={styles.quotaLabel}>
              <span>Storage</span>
              <span>{formatBytes(storageUsed)} / 500 MB</span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={`${styles.progressFill} ${quotaPercent > 90 ? styles.progressWarning : ''}`}
                style={{ width: `${quotaPercent}%` }}
              ></div>
            </div>
          </div>

          {currentUser && (
            <div className={styles.userCard}>
              <div className={styles.avatar}>
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div className={styles.userText}>
                <span className={styles.username}>{currentUser.username}</span>
                <span className={styles.email}>{currentUser.email}</span>
              </div>
            </div>
          )}

          <button onClick={handleLogout} className={styles.logoutButton}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Workspace */}
      <main
        className={styles.main}
        onDragEnter={handleExternalDragEnter}
        onDragOver={handleExternalDragOver}
        onDragLeave={handleExternalDragLeave}
        onDrop={handleExternalDrop}
      >
        {/* Drag and drop overlay */}
        {dragActive && (
          <div
            className={styles.dragOverlay}
            onDragEnter={handleExternalDragEnter}
            onDragOver={handleExternalDragOver}
            onDragLeave={handleExternalDragLeave}
            onDrop={handleExternalDrop}
          >
            <Upload size={48} style={{ marginBottom: '16px' }} />
            Drop your file here to upload directly to BenzDrive
          </div>
        )}

        {/* Header toolbar */}
        <header className={styles.header}>
          {activeTab === 'drive' ? (
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search files, folders, or recent activity..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          ) : (
            <div style={{ flexGrow: 1 }} />
          )}

          <div className={styles.headerActions}>
            <button className={styles.headerIconBtn} title="Notifications">
              <Bell size={18} />
            </button>
            <button className={styles.headerIconBtn} title="Settings" onClick={() => setActiveTab('settings')}>
              <Settings size={18} />
            </button>
            <button className={styles.headerIconBtn} title="Help & Support">
              <HelpCircle size={18} />
            </button>
          </div>
        </header>

        {/* Tab contents */}
        {activeTab === 'drive' && (
          <>
            {/* Welcome Greeting Banner */}
            <div className={styles.greetingBanner}>
              <h2 className={styles.greetingTitle}>
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {currentUser?.username || 'User'}
              </h2>
            </div>

            {/* Directory breadcrumbs / Search Header / Selection Action Bar */}
            <div className={styles.toolbar}>
              {selectedItems.size > 0 ? (
                <div className={styles.selectionBar}>
                  <div className={styles.selectionInfo}>
                    <button
                      className={styles.closeSelectionBtn}
                      onClick={() => setSelectedItems(new Map())}
                      title="Deselect All (Esc)"
                    >
                      <X size={18} />
                    </button>
                    <span className={styles.selectionCount}>
                      {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
                    </span>
                  </div>
                  <div className={styles.selectionActions}>
                    <button onClick={handleBulkStar} className={styles.selectionActionBtn} title="Star / Unstar Selected">
                      <Star size={16} />
                      <span>Star</span>
                    </button>
                    <button onClick={handleBulkDownload} className={styles.selectionActionBtn} title="Download Selected Files">
                      <Download size={16} />
                      <span>Download</span>
                    </button>
                    <button onClick={handleBulkTrash} className={`${styles.selectionActionBtn} ${styles.dangerActionBtn}`} title="Move Selected to Trash">
                      <Trash2 size={16} />
                      <span>Trash</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.breadcrumbs}>
                    {searchQuery.trim() !== '' ? (
                      <span className={styles.breadcrumbActive}>
                        Search Results for &ldquo;{searchQuery}&rdquo;
                      </span>
                    ) : (
                      <>
                        <span
                          onClick={() => setCurrentFolderId('root')}
                          onDragOver={(e) => handleDragOverTarget(e, 'root')}
                          onDragLeave={handleDragLeaveTarget}
                          onDrop={(e) => handleDropOnTarget(e, 'root', 'My Drive')}
                          className={`${styles.breadcrumbLink} ${activeDropTargetId === 'root' ? styles.dropTarget : ''}`}
                        >
                          My Drive
                        </span>
                        {breadcrumbs.map((crumb, idx) => (
                          <React.Fragment key={crumb.id}>
                            <span style={{ opacity: 0.5 }}>/</span>
                            <span
                              onClick={() => setCurrentFolderId(crumb.id)}
                              onDragOver={(e) => handleDragOverTarget(e, crumb.id)}
                              onDragLeave={handleDragLeaveTarget}
                              onDrop={(e) => handleDropOnTarget(e, crumb.id, crumb.name)}
                              className={`${idx === breadcrumbs.length - 1 ? styles.breadcrumbActive : styles.breadcrumbLink} ${activeDropTargetId === crumb.id ? styles.dropTarget : ''}`}
                            >
                              {crumb.name}
                            </span>
                          </React.Fragment>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Action buttons (hidden during search or when in viewer-only mode) */}
                  {searchQuery.trim() === '' && canEditCurrentFolder && (
                    <div className={styles.actions}>
                      <button onClick={() => setShowFolderModal(true)} className={styles.newFolderBtn}>
                        <FolderPlus size={16} />
                        <span>New Folder</span>
                      </button>
                      
                      <label className={styles.fileInputLabel}>
                        <Upload size={16} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          ref={fileInputRef}
                          multiple
                          onChange={(e) => handleFileUpload(e.target.files)}
                          style={{ display: 'none' }}
                        />
                      </label>

                      <label className={styles.fileInputLabel}>
                        <FolderIcon size={16} />
                        <span>Upload Folder</span>
                        <input
                          type="file"
                          ref={folderInputRef}
                          {...({ webkitdirectory: '', directory: '' } as any)}
                          multiple
                          onChange={(e) => handleFolderInputChange(e.target.files)}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Folder Explorer */}
            <div
              ref={contentAreaRef}
              onMouseDown={handleContainerMouseDown}
              onMouseMove={handleContainerMouseMove}
              onMouseUp={handleContainerMouseUp}
              onMouseLeave={handleContainerMouseUp}
              style={{ position: 'relative' }}
              className={styles.contentArea}
            >
              {isMarquee && marqueeBox && (
                <div
                  className={styles.selectionBox}
                  style={{
                    left: Math.min(marqueeBox.startX, marqueeBox.currentX),
                    top: Math.min(marqueeBox.startY, marqueeBox.currentY),
                    width: Math.abs(marqueeBox.currentX - marqueeBox.startX),
                    height: Math.abs(marqueeBox.currentY - marqueeBox.startY),
                  }}
                />
              )}

              {loading ? (
                <div style={{ textAlign: 'center', marginTop: '40px', opacity: 0.7 }}>Loading directory contents...</div>
              ) : (
                <>
                  {filteredFolders.length === 0 && filteredFiles.length === 0 && (
                    <div className={styles.emptyState}>
                      <FolderIcon size={40} style={{ opacity: 0.3 }} />
                      <p>This folder is empty. Drag a file here or click upload to add contents.</p>
                    </div>
                  )}

                  {/* Folders grid */}
                  {filteredFolders.length > 0 && (
                    <div>
                      <h3 className={styles.sectionTitle}>Folders</h3>
                      <div className={styles.folderGrid}>
                        {filteredFolders.map((folder) => {
                          const allVisibleItems = [
                            ...filteredFolders.map((f) => ({ id: f.id, type: 'folder' as const, name: f.name })),
                            ...filteredFiles.map((f) => ({ id: f.id, type: 'file' as const, name: f.fileName })),
                          ];
                          const isSelected = selectedItems.has(folder.id);
                          const isMultiMenu = isSelected && selectedItems.size > 1;

                          return (
                            <div
                              key={folder.id}
                              data-selectable-id={folder.id}
                              data-selectable-type="folder"
                              data-selectable-name={folder.name}
                              draggable
                              onDragStart={(e) => handleDragStartItem(e, folder.id, 'folder', folder.name)}
                              onDragEnd={handleDragEndItem}
                              onDragOver={(e) => handleDragOverTarget(e, folder.id)}
                              onDragLeave={handleDragLeaveTarget}
                              onDrop={(e) => handleDropOnTarget(e, folder.id, folder.name)}
                              onClick={(e) => handleItemSelectClick(e, { id: folder.id, type: 'folder', name: folder.name }, allVisibleItems)}
                              onDoubleClick={() => {
                                setCurrentFolderId(folder.id);
                                setSearchQuery('');
                                setSearchResults(null);
                              }}
                              onContextMenu={(e) => handleItemContextMenu(e, { id: folder.id, type: 'folder', name: folder.name })}
                              className={`${styles.folderCard} ${isSelected ? styles.selectedItemCard : ''} ${activeMenuId === folder.id ? styles.activeMenuCard : ''} ${draggedItem?.id === folder.id ? styles.dragging : ''} ${activeDropTargetId === folder.id ? styles.dropTarget : ''}`}
                            >
                              <FolderIcon size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                              <span className={styles.folderName}>{folder.name}</span>
                              
                              <div className={styles.menuContainer} onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => handleToggleStarFolder(e, folder.id)}
                                  className={styles.actionIconBtn}
                                  title={folder.isStarred ? 'Unstar Folder' : 'Star Folder'}
                                >
                                  <Star size={14} fill={folder.isStarred ? '#f59e0b' : 'none'} style={{ color: folder.isStarred ? '#f59e0b' : '#707882' }} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === folder.id ? null : folder.id);
                                  }}
                                  className={styles.actionIconBtn}
                                  title="More actions"
                                >
                                  <MoreVertical size={14} />
                                </button>

                                {activeMenuId === folder.id && (
                                  <div className={styles.dropdownMenu}>
                                    {isMultiMenu ? (
                                      <>
                                        <div className={styles.dropdownHeader}>
                                          {selectedItems.size} items selected
                                        </div>
                                        <button onClick={handleBulkStar} className={styles.dropdownItem}>
                                          <Star size={15} />
                                          <span>Star selected items</span>
                                        </button>
                                        <button onClick={handleBulkDownload} className={styles.dropdownItem}>
                                          <Download size={15} />
                                          <span>Download selected files</span>
                                        </button>
                                        {(canEditCurrentFolder || isItemOwner(folder)) && (
                                          <>
                                            <div className={styles.dropdownDivider} />
                                            <button onClick={handleBulkTrash} className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}>
                                              <Trash2 size={15} />
                                              <span>Move {selectedItems.size} items to trash</span>
                                            </button>
                                          </>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        {isItemOwner(folder) && (
                                          <button onClick={() => { setActiveMenuId(null); handleOpenShareModal({ id: folder.id, name: folder.name, type: 'folder' }); }} className={styles.dropdownItem}>
                                            <Share2 size={15} />
                                            <span>Share</span>
                                          </button>
                                        )}
                                        <button onClick={() => { setActiveMenuId(null); setCurrentFolderId(folder.id); setSearchQuery(''); }} className={styles.dropdownItem}>
                                          <FolderIcon size={15} />
                                          <span>Open folder</span>
                                        </button>
                                        <button onClick={(e) => { setActiveMenuId(null); handleToggleStarFolder(e, folder.id); }} className={styles.dropdownItem}>
                                          <Star size={15} fill={folder.isStarred ? '#f59e0b' : 'none'} style={{ color: folder.isStarred ? '#f59e0b' : '#404751' }} />
                                          <span>{folder.isStarred ? 'Unstar folder' : 'Add to Starred'}</span>
                                        </button>
                                        {(canEditCurrentFolder || isItemOwner(folder)) && (
                                          <>
                                            <div className={styles.dropdownDivider} />
                                            <button onClick={() => { setActiveMenuId(null); handleTrashFolder(folder.id); }} className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}>
                                              <Trash2 size={15} />
                                              <span>Move to trash</span>
                                            </button>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Files List */}
                  {filteredFiles.length > 0 && (
                    <div className={styles.filesSection}>
                      <h3 className={styles.sectionTitle}>Files</h3>
                      <div className={styles.fileList}>
                        {filteredFiles.map((file) => {
                          const allVisibleItems = [
                            ...filteredFolders.map((f) => ({ id: f.id, type: 'folder' as const, name: f.name })),
                            ...filteredFiles.map((f) => ({ id: f.id, type: 'file' as const, name: f.fileName })),
                          ];
                          const isSelected = selectedItems.has(file.id);
                          const isMultiMenu = isSelected && selectedItems.size > 1;

                          return (
                            <div
                              key={file.id}
                              data-selectable-id={file.id}
                              data-selectable-type="file"
                              data-selectable-name={file.fileName}
                              draggable
                              onDragStart={(e) => handleDragStartItem(e, file.id, 'file', file.fileName)}
                              onDragEnd={handleDragEndItem}
                              onClick={(e) => handleItemSelectClick(e, { id: file.id, type: 'file', name: file.fileName }, allVisibleItems)}
                              onContextMenu={(e) => handleItemContextMenu(e, { id: file.id, type: 'file', name: file.fileName })}
                              className={`${styles.fileRow} ${isSelected ? styles.selectedItemRow : ''} ${activeMenuId === file.id ? styles.activeMenuRow : ''} ${draggedItem?.id === file.id ? styles.dragging : ''}`}
                            >
                              <div className={styles.fileInfo}>
                                {getFileIcon(file.fileType)}
                                <span className={styles.fileName}>{file.fileName}</span>
                              </div>
                              
                              <div className={styles.fileMeta}>
                                <span>{formatBytes(file.sizeBytes)}</span>
                                <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                              </div>

                              <div className={styles.fileActions}>
                                {isItemOwner(file) && (
                                  <button
                                    onClick={() => handleOpenShareModal({ id: file.id, name: file.fileName, type: 'file' })}
                                    className={styles.actionIconBtn}
                                    title="Share File"
                                  >
                                    <Share2 size={15} />
                                  </button>
                                )}

                                <button
                                  onClick={(e) => handleToggleStarFile(e, file.id)}
                                  className={styles.actionIconBtn}
                                  title={file.isStarred ? 'Unstar File' : 'Star File'}
                                >
                                  <Star size={15} fill={file.isStarred ? '#f59e0b' : 'none'} style={{ color: file.isStarred ? '#f59e0b' : '#707882' }} />
                                </button>

                                <button
                                  onClick={() => handleDownload(file.id, file.fileName)}
                                  className={styles.actionIconBtn}
                                  title="Download File"
                                >
                                  <Download size={15} />
                                </button>

                                <button
                                  onClick={(e) => handleDuplicateFile(e, file.id)}
                                  className={styles.actionIconBtn}
                                  title="Make a Copy"
                                >
                                  <Copy size={15} />
                                </button>

                                {/* More actions (...) dropdown menu */}
                                <div className={styles.menuContainer} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(activeMenuId === file.id ? null : file.id);
                                    }}
                                    className={styles.actionIconBtn}
                                    title="More actions"
                                  >
                                    <MoreVertical size={16} />
                                  </button>

                                  {activeMenuId === file.id && (
                                    <div className={styles.dropdownMenu}>
                                      {isMultiMenu ? (
                                        <>
                                          <div className={styles.dropdownHeader}>
                                            {selectedItems.size} items selected
                                          </div>
                                          <button onClick={handleBulkStar} className={styles.dropdownItem}>
                                            <Star size={15} />
                                            <span>Star selected items</span>
                                          </button>
                                          <button onClick={handleBulkDownload} className={styles.dropdownItem}>
                                            <Download size={15} />
                                            <span>Download selected files</span>
                                          </button>
                                          <div className={styles.dropdownDivider} />
                                          {(canEditCurrentFolder || isItemOwner(file)) && (
                                            <>
                                              <div className={styles.dropdownDivider} />
                                              <button onClick={handleBulkTrash} className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}>
                                                <Trash2 size={15} />
                                                <span>Move {selectedItems.size} items to trash</span>
                                              </button>
                                            </>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          {isItemOwner(file) && (
                                            <button onClick={() => { setActiveMenuId(null); handleOpenShareModal({ id: file.id, name: file.fileName, type: 'file' }); }} className={styles.dropdownItem}>
                                              <Share2 size={15} />
                                              <span>Share</span>
                                            </button>
                                          )}
                                          <button onClick={() => { setActiveMenuId(null); handleDownload(file.id, file.fileName); }} className={styles.dropdownItem}>
                                            <Download size={15} />
                                            <span>Download</span>
                                          </button>
                                          <button onClick={(e) => { setActiveMenuId(null); handleToggleStarFile(e, file.id); }} className={styles.dropdownItem}>
                                            <Star size={15} fill={file.isStarred ? '#f59e0b' : 'none'} style={{ color: file.isStarred ? '#f59e0b' : '#404751' }} />
                                            <span>{file.isStarred ? 'Unstar file' : 'Add to Starred'}</span>
                                          </button>
                                          {canEditCurrentFolder && (
                                            <button onClick={(e) => handleDuplicateFile(e, file.id)} className={styles.dropdownItem}>
                                              <Copy size={15} />
                                              <span>Make a copy</span>
                                            </button>
                                          )}
                                          {(canEditCurrentFolder || isItemOwner(file)) && (
                                            <>
                                              <div className={styles.dropdownDivider} />
                                              <button onClick={() => { setActiveMenuId(null); handleTrashFile(file.id); }} className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}>
                                                <Trash2 size={15} />
                                                <span>Move to trash</span>
                                              </button>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Trash bin panel */}
        {activeTab === 'trash' && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.breadcrumbs}>
                <span
                  onClick={() => setCurrentTrashedFolderId(null)}
                  className={currentTrashedFolderId ? styles.breadcrumbLink : styles.breadcrumbActive}
                >
                  Trash Root
                </span>
                {currentTrashedFolderId && trashedBreadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id}>
                    <span style={{ opacity: 0.5 }}>/</span>
                    <span
                      onClick={() => setCurrentTrashedFolderId(crumb.id)}
                      className={idx === trashedBreadcrumbs.length - 1 ? styles.breadcrumbActive : styles.breadcrumbLink}
                    >
                      {crumb.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>

              {(trashedFolders.length > 0 || trashedFiles.length > 0) && (
                <button onClick={handleEmptyTrash} className={styles.logoutButton} style={{ margin: 0, width: 'auto' }}>
                  <Trash size={16} />
                  <span>Empty Trash Bin</span>
                </button>
              )}
            </div>

            <div className={styles.contentArea}>
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: '40px', opacity: 0.7 }}>Loading trash...</div>
              ) : (
                <>
                  {trashedFolders.length === 0 && trashedFiles.length === 0 && (
                    <div className={styles.emptyState}>
                      <Trash2 size={40} style={{ opacity: 0.3 }} />
                      <p>Your Trash bin is empty.</p>
                    </div>
                  )}

                  {/* Trashed folders */}
                  {trashedFolders.length > 0 && (
                    <div>
                      <h3 className={styles.sectionTitle}>Trashed Folders</h3>
                      <div className={styles.folderGrid}>
                        {trashedFolders.map((folder) => (
                          <div
                            key={folder.id}
                            className={styles.folderCard}
                            onDoubleClick={() => setCurrentTrashedFolderId(folder.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <FolderIcon size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span className={styles.folderName}>{folder.name}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => handleRestoreFolder(folder.id)}
                                className={`${styles.actionIconBtn} ${styles.actionRestoreBtn}`}
                                title="Restore Folder"
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Trashed files */}
                  {trashedFiles.length > 0 && (
                    <div className={styles.filesSection}>
                      <h3 className={styles.sectionTitle}>Trashed Files</h3>
                      <div className={styles.fileList}>
                        {trashedFiles.map((file) => (
                          <div key={file.id} className={styles.fileRow}>
                            <div className={styles.fileInfo}>
                              {getFileIcon(file.fileType)}
                              <span className={styles.fileName}>{file.fileName}</span>
                            </div>
                            
                            <div className={styles.fileMeta}>
                              <span>{formatBytes(file.sizeBytes)}</span>
                            </div>

                            <div className={styles.fileActions}>
                              <button
                                onClick={() => handleRestoreFile(file.id)}
                                className={`${styles.actionIconBtn} ${styles.actionRestoreBtn}`}
                                title="Restore File"
                              >
                                <RotateCcw size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Settings panel */}
        {activeTab === 'settings' && currentUser && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.breadcrumbs}>
                <span className={styles.breadcrumbActive}>Account Settings</span>
              </div>
            </div>

            <div className={styles.contentArea}>
              <div className="glass-panel" style={{ maxWidth: '500px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Security Settings</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Two-Factor Authentication (2FA)</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                      Require a 6-digit verification code sent to your email address when logging into your account.
                    </p>
                  </div>
                  
                  <button
                    onClick={handleToggle2FA}
                    disabled={loading}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      backgroundColor: currentUser.isTwoFactorEnabled ? 'var(--danger)' : 'var(--primary)',
                      color: '#fff'
                    }}
                  >
                    {currentUser.isTwoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Starred items tab */}
        {activeTab === 'starred' && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.breadcrumbs}>
                <span className={styles.breadcrumbActive}>Starred Items</span>
              </div>
            </div>

            <div className={styles.contentArea}>
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: '40px', opacity: 0.7 }}>Loading starred items...</div>
              ) : (
                <>
                  {starredFolders.length === 0 && starredFiles.length === 0 && (
                    <div className={styles.emptyState}>
                      <Star size={44} style={{ opacity: 0.3, color: '#f59e0b' }} />
                      <p style={{ fontWeight: 600 }}>No Starred Items</p>
                      <span style={{ fontSize: '13px', opacity: 0.7 }}>Click the star icon on any file or folder to access it quickly here.</span>
                    </div>
                  )}

                  {/* Starred Folders */}
                  {starredFolders.length > 0 && (
                    <div>
                      <h3 className={styles.sectionTitle}>Starred Folders</h3>
                      <div className={styles.folderGrid}>
                        {starredFolders.map((folder) => (
                          <div
                            key={folder.id}
                            onDoubleClick={() => {
                              setActiveTab('drive');
                              setCurrentFolderId(folder.id);
                            }}
                            className={styles.folderCard}
                          >
                            <FolderIcon size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span className={styles.folderName}>{folder.name}</span>
                            <button
                              onClick={(e) => handleToggleStarFolder(e, folder.id)}
                              className={styles.actionIconBtn}
                              title="Unstar Folder"
                            >
                              <Star size={14} fill="#f59e0b" style={{ color: '#f59e0b' }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Starred Files */}
                  {starredFiles.length > 0 && (
                    <div className={styles.filesSection}>
                      <h3 className={styles.sectionTitle}>Starred Files</h3>
                      <div className={styles.fileList}>
                        {starredFiles.map((file) => (
                          <div key={file.id} className={styles.fileRow}>
                            <div className={styles.fileInfo}>
                              {getFileIcon(file.fileType)}
                              <span className={styles.fileName}>{file.fileName}</span>
                            </div>
                            
                            <div className={styles.fileMeta}>
                              <span>{formatBytes(file.sizeBytes)}</span>
                              <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                            </div>

                            <div className={styles.fileActions}>
                              <button
                                onClick={(e) => handleToggleStarFile(e, file.id)}
                                className={styles.actionIconBtn}
                                title="Unstar File"
                              >
                                <Star size={15} fill="#f59e0b" style={{ color: '#f59e0b' }} />
                              </button>
                              <button
                                onClick={() => handleDownload(file.id, file.fileName)}
                                className={styles.actionIconBtn}
                                title="Download File"
                              >
                                <Download size={15} />
                              </button>
                              <button
                                onClick={(e) => handleDuplicateFile(e, file.id)}
                                className={styles.actionIconBtn}
                                title="Make a Copy"
                              >
                                <Copy size={15} />
                              </button>
                              <button
                                onClick={() => handleTrashFile(file.id)}
                                className={`${styles.actionIconBtn} ${styles.actionDeleteBtn}`}
                                title="Move to Trash"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Recent files tab */}
        {activeTab === 'recent' && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.breadcrumbs}>
                <span className={styles.breadcrumbActive}>Recent Files</span>
              </div>
            </div>

            <div className={styles.contentArea}>
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: '40px', opacity: 0.7 }}>Loading recent files...</div>
              ) : (
                <>
                  {recentFiles.length === 0 && (
                    <div className={styles.emptyState}>
                      <Clock size={44} style={{ opacity: 0.3, color: '#0077be' }} />
                      <p style={{ fontWeight: 600 }}>Your recent activity</p>
                      <span style={{ fontSize: '13px', opacity: 0.7 }}>Files you edit or open recently will appear here.</span>
                    </div>
                  )}

                  {recentFiles.length > 0 && (
                    <div className={styles.filesSection}>
                      <h3 className={styles.sectionTitle}>Recently Accessed & Modified Files</h3>
                      <div className={styles.fileList}>
                        {recentFiles.map((file) => (
                          <div key={file.id} className={styles.fileRow}>
                            <div className={styles.fileInfo}>
                              {getFileIcon(file.fileType)}
                              <span className={styles.fileName}>{file.fileName}</span>
                            </div>
                            
                            <div className={styles.fileMeta}>
                              <span>{formatBytes(file.sizeBytes)}</span>
                              <span>{file.lastAccessedAt ? `Accessed ${new Date(file.lastAccessedAt).toLocaleTimeString()}` : `Modified ${new Date(file.createdAt).toLocaleDateString()}`}</span>
                            </div>

                            <div className={styles.fileActions}>
                              <button
                                onClick={(e) => handleToggleStarFile(e, file.id)}
                                className={styles.actionIconBtn}
                                title={file.isStarred ? 'Unstar File' : 'Star File'}
                              >
                                <Star size={15} fill={file.isStarred ? '#f59e0b' : 'none'} style={{ color: file.isStarred ? '#f59e0b' : 'inherit' }} />
                              </button>
                              <button
                                onClick={() => handleDownload(file.id, file.fileName)}
                                className={styles.actionIconBtn}
                                title="Download File"
                              >
                                <Download size={15} />
                              </button>
                              <button
                                onClick={(e) => handleDuplicateFile(e, file.id)}
                                className={styles.actionIconBtn}
                                title="Make a Copy"
                              >
                                <Copy size={15} />
                              </button>
                              <button
                                onClick={() => handleTrashFile(file.id)}
                                className={`${styles.actionIconBtn} ${styles.actionDeleteBtn}`}
                                title="Move to Trash"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Shared files tab */}
        {activeTab === 'shared' && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.breadcrumbs}>
                <span className={styles.breadcrumbActive}>Shared with Me</span>
              </div>
            </div>

            <div className={styles.contentArea}>
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: '40px', opacity: 0.7 }}>Loading shared items...</div>
              ) : (
                <>
                  {sharedFolders.length === 0 && sharedFiles.length === 0 && (
                    <div className={styles.emptyState}>
                      <Users size={44} style={{ opacity: 0.3, color: '#0077be' }} />
                      <p style={{ fontWeight: 600 }}>No Shared Items</p>
                      <span style={{ fontSize: '13px', opacity: 0.7 }}>Files and folders shared with your account will appear here.</span>
                    </div>
                  )}

                  {/* Shared Folders */}
                  {sharedFolders.length > 0 && (
                    <div>
                      <h3 className={styles.sectionTitle}>Shared Folders</h3>
                      <div className={styles.folderGrid}>
                        {sharedFolders.map((folder) => (
                          <div
                            key={folder.id}
                            onDoubleClick={() => {
                              setActiveTab('drive');
                              setCurrentFolderId(folder.id);
                            }}
                            className={styles.folderCard}
                          >
                            <FolderIcon size={20} style={{ color: '#0077be', flexShrink: 0 }} />
                            <div style={{ minWidth: 0, flexGrow: 1 }}>
                              <span className={styles.folderName} title={folder.name}>{folder.name}</span>
                              <p style={{ fontSize: '11px', color: '#707882', margin: '2px 0 0' }}>
                                Shared by {folder.sharedBy?.username || folder.sharedBy?.email} • <span style={{ fontWeight: 600, color: '#0077be' }}>{folder.shareRole}</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shared Files */}
                  {sharedFiles.length > 0 && (
                    <div className={styles.filesSection}>
                      <h3 className={styles.sectionTitle}>Shared Files</h3>
                      <div className={styles.fileList}>
                        {sharedFiles.map((file) => (
                          <div key={file.id} className={styles.fileRow}>
                            <div className={styles.fileInfo}>
                              {getFileIcon(file.fileType)}
                              <div>
                                <span className={styles.fileName}>{file.fileName}</span>
                                <p style={{ fontSize: '11px', color: '#707882', margin: 0 }}>
                                  Shared by {file.sharedBy?.username || file.sharedBy?.email} • <span style={{ fontWeight: 600, color: '#0077be' }}>{file.shareRole}</span>
                                </p>
                              </div>
                            </div>
                            
                            <div className={styles.fileMeta}>
                              <span>{formatBytes(file.sizeBytes)}</span>
                            </div>

                            <div className={styles.fileActions}>
                              <button
                                onClick={() => handleDownload(file.id, file.fileName)}
                                className={styles.actionIconBtn}
                                title="Download File"
                              >
                                <Download size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* 3. New Folder Modal Overlay */}
        {showFolderModal && (
          <div className={styles.modalOverlay}>
            <div className={`glass-panel ${styles.modalContent}`}>
              <h2 className={styles.modalTitle}>Create New Folder</h2>
              <form onSubmit={handleCreateFolder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <input
                  type="text"
                  placeholder="Folder Name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className={styles.searchInput}
                  style={{ paddingLeft: '16px' }}
                  required
                  autoFocus
                />
                <div className={styles.modalButtons}>
                  <button
                    type="button"
                    onClick={() => { setShowFolderModal(false); setNewFolderName(''); }}
                    className={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className={styles.fileInputLabel}
                    style={{ border: 'none', padding: '10px 20px' }}
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 4. Confirm Empty Trash Modal Overlay */}
        {showConfirmModal && (
          <div className={styles.modalOverlay}>
            <div className={`glass-panel ${styles.modalContent}`} style={{ textAlign: 'center', borderRadius: '16px', padding: '32px 28px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  boxShadow: '0 0 24px rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                }}
              >
                <Trash2 size={24} style={{ color: '#ef4444' }} />
              </div>

              <h2 className={styles.modalTitle} style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0' }}>
                Empty Trash?
              </h2>

              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0 0 24px 0' }}>
                Are you sure you want to permanently delete all items in the trash? This action cannot be undone.
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    confirmEmptyTrash();
                  }}
                  className={styles.fileInputLabel}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '8px',
                    margin: 0,
                  }}
                >
                  Empty Trash
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className={styles.newFolderBtn}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: '8px',
                    margin: 0,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share Modal Overlay */}
        {showShareModal && shareTarget && (
          <div className={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
            <div className={`glass-panel ${styles.modalContent}`} style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 className={styles.modalTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Share2 size={20} style={{ color: '#0077be' }} />
                  Share &ldquo;{shareTarget.name}&rdquo;
                </h3>
                <button onClick={() => setShowShareModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#707882' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleShareSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="email"
                    placeholder="Add people by email..."
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    className={styles.searchInput}
                    style={{ flexGrow: 1, paddingLeft: '14px' }}
                    required
                  />
                  <select
                    value={shareRole}
                    onChange={(e) => setShareRole(e.target.value as any)}
                    className={styles.searchInput}
                    style={{ width: '110px', paddingLeft: '10px' }}
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                  </select>
                  <button type="submit" disabled={shareLoading} className={styles.newFolderBtn} style={{ margin: 0 }}>
                    Share
                  </button>
                </div>
              </form>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#707882', marginBottom: '12px' }}>
                  People with access
                </h4>

                {shareLoading && collaborators.length === 0 ? (
                  <div style={{ fontSize: '13px', opacity: 0.7, padding: '12px 0' }}>Loading collaborators...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto' }}>
                    {collaborators.length === 0 ? (
                      <div style={{ fontSize: '13px', color: '#707882', fontStyle: 'italic' }}>
                        Not shared directly with anyone yet.
                      </div>
                    ) : (
                      collaborators.map((c) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className={styles.avatar} style={{ width: '32px', height: '32px', fontSize: '12px' }}>
                              {(c.grantee?.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>{c.grantee?.username || 'User'}</p>
                              <p style={{ fontSize: '11px', color: '#707882', margin: 0 }}>{c.grantee?.email}</p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <select
                              value={c.role}
                              onChange={(e) => handleUpdateShareRole(c.id, e.target.value as any)}
                              style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            >
                              <option value="VIEWER">Viewer</option>
                              <option value="EDITOR">Editor</option>
                            </select>

                            <button
                              onClick={() => handleRevokeShare(c.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ba1a1a', padding: '4px' }}
                              title="Remove access"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* General Access Section (Google Drive Style) */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#707882', marginBottom: '8px' }}>
                  General Access
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isPublicLinkEnabled ? (
                      <Globe size={18} style={{ color: '#10b981' }} />
                    ) : (
                      <Lock size={18} style={{ color: '#005e97' }} />
                    )}
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>
                        {isPublicLinkEnabled ? 'Anyone with the link' : 'Restricted'}
                      </p>
                      <p style={{ fontSize: '11px', color: '#707882', margin: 0 }}>
                        {isPublicLinkEnabled
                          ? 'Anyone on the internet with the link can view'
                          : 'Only people added under "People with access" can open with this link'}
                      </p>
                    </div>
                  </div>
                  <select
                    value={isPublicLinkEnabled ? 'public' : 'restricted'}
                    onChange={(e) => handleToggleGeneralAccess(e.target.value === 'public')}
                    style={{ fontSize: '12px', fontWeight: 600, padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                  >
                    <option value="restricted">Restricted</option>
                    <option value="public">Anyone with link</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={handleCopyShareLink} className={styles.newFolderBtn} style={{ background: 'rgba(0,119,190,0.1)', color: '#0077be', margin: 0 }}>
                  <Link size={15} />
                  <span>Copy share link</span>
                </button>

                <button onClick={() => setShowShareModal(false)} className={styles.cancelBtn}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Google Drive-style Upload Progress Widget */}
        <UploadWidget tasks={uploadTasks} onClose={() => setUploadTasks([])} />
      </main>
    </div>
  );
}
