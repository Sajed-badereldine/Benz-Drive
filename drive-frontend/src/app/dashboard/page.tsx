'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
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
  Trash
} from 'lucide-react';

interface FileItem {
  id: string;
  fileName: string;
  s3Key: string;
  sizeBytes: number;
  fileType: 'image' | 'video' | 'audio' | 'document' | 'other';
  createdAt: string;
}

interface FolderItem {
  id: string;
  name: string;
  parentFolderId: string | null;
}

interface User {
  id: string;
  username: string;
  email: string;
  isTwoFactorEnabled: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'drive' | 'trash' | 'settings'>('drive');
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
  
  // Trashed items states
  const [currentTrashedFolderId, setCurrentTrashedFolderId] = useState<string | null>(null);
  const [trashedBreadcrumbs, setTrashedBreadcrumbs] = useState<FolderItem[]>([]);
  const [trashedFolders, setTrashedFolders] = useState<FolderItem[]>([]);
  const [trashedFiles, setTrashedFiles] = useState<FileItem[]>([]);

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
  const dragCounter = useRef(0);

  // Drag and Drop re-parenting states
  const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'file' | 'folder'; name: string } | null>(null);
  const [activeDropTargetId, setActiveDropTargetId] = useState<string | null>(null);

  // Authenticate user on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      showToast('Please sign in to access your drive.', 'error');
      router.push('/login');
      return;
    }

    try {
      setCurrentUser(JSON.parse(userStr));
    } catch {
      localStorage.clear();
      router.push('/login');
    }
  }, [router, showToast]);

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

  // Handle file upload trigger
  const handleFileUpload = async (filesToUpload: FileList | null) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    
    const file = filesToUpload[0];
    
    // Quick size validation against 50MB max file size
    if (file.size > 50 * 1024 * 1024) {
      showToast('File size exceeds the maximum limit of 50 MB. Please choose a smaller file.', 'error');
      return;
    }

    // Local quota check
    if (storageUsed + file.size > quotaBytes) {
      showToast('Not enough space. Please free up some space.', 'error');
      return;
    }

    setLoading(true);

    try {
      // 1. Get presigned upload URL and fileId from backend
      const presignedData = await apiFetch('/files/presigned-upload', {
        method: 'POST',
        bodyData: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          folderId: currentFolderId === 'root' ? null : currentFolderId,
        },
      });

      // 2. Upload file binary directly to S3 (bypassing backend)
      const s3Response = await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: file,
      });

      if (!s3Response.ok) {
        throw new Error(`S3 upload failed: ${s3Response.statusText}`);
      }

      // 3. Confirm upload with the backend
      await apiFetch(`/files/confirm-upload/${presignedData.fileId}`, {
        method: 'POST',
      });

      showToast('File successfully uploaded!', 'success');
      fetchFolderContents();
      fetchQuotaUsage();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
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

  const handleExternalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);

    if (draggedItem) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
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
  const handleLogout = () => {
    localStorage.clear();
    showToast('Signed out successfully.', 'success');
    router.push('/login');
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

  const filteredFolders = searchQuery.trim() !== ''
    ? (searchResults?.folders || [])
    : folders;

  const filteredFiles = searchQuery.trim() !== ''
    ? (searchResults?.files || [])
    : files;

  const quotaPercent = Math.min(100, (storageUsed / quotaBytes) * 100);

  return (
    <div className={styles.container}>
      {/* 1. Sidebar Panel */}
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.logo}>BenzDrive</div>
          <nav className={styles.nav}>
            <button
              onClick={() => { setActiveTab('drive'); setCurrentFolderId('root'); }}
              className={`${styles.navLink} ${activeTab === 'drive' ? styles.activeNavLink : ''}`}
            >
              <FolderIcon size={18} />
              <span>My Drive</span>
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
              <span>Storage Used</span>
              <span>{formatBytes(storageUsed)} / 500 MB</span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${quotaPercent}%`,
                  backgroundColor: quotaPercent > 90 ? 'var(--danger)' : quotaPercent > 70 ? '#f59e0b' : 'var(--primary)'
                }}
              ></div>
            </div>
          </div>

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
                placeholder="Search in folder..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          ) : (
            <div style={{ flexGrow: 1 }} />
          )}

          {currentUser && (
            <div className={styles.userInfo}>
              <div className={styles.avatar}>
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div className={styles.userText}>
                <span className={styles.username}>{currentUser.username}</span>
                <span className={styles.email}>{currentUser.email}</span>
              </div>
            </div>
          )}
        </header>

        {/* Tab contents */}
        {activeTab === 'drive' && (
          <>
            <div className={styles.toolbar}>
              {/* Directory breadcrumbs / Search Header */}
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

              {/* Action buttons (hidden during search) */}
              {searchQuery.trim() === '' && (
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
                      onChange={(e) => handleFileUpload(e.target.files)}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Folder Explorer */}
            <div className={styles.contentArea}>
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
                        {filteredFolders.map((folder) => (
                          <div
                            key={folder.id}
                            draggable
                            onDragStart={(e) => handleDragStartItem(e, folder.id, 'folder', folder.name)}
                            onDragEnd={handleDragEndItem}
                            onDragOver={(e) => handleDragOverTarget(e, folder.id)}
                            onDragLeave={handleDragLeaveTarget}
                            onDrop={(e) => handleDropOnTarget(e, folder.id, folder.name)}
                            onDoubleClick={() => {
                              setCurrentFolderId(folder.id);
                              setSearchQuery('');
                              setSearchResults(null);
                            }}
                            className={`${styles.folderCard} ${draggedItem?.id === folder.id ? styles.dragging : ''} ${activeDropTargetId === folder.id ? styles.dropTarget : ''}`}
                          >
                            <FolderIcon size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span className={styles.folderName}>{folder.name}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleTrashFolder(folder.id); }}
                              className={`${styles.actionIconBtn} ${styles.actionDeleteBtn}`}
                              title="Move to Trash"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Files List */}
                  {filteredFiles.length > 0 && (
                    <div className={styles.filesSection}>
                      <h3 className={styles.sectionTitle}>Files</h3>
                      <div className={styles.fileList}>
                        {filteredFiles.map((file) => (
                          <div
                            key={file.id}
                            draggable
                            onDragStart={(e) => handleDragStartItem(e, file.id, 'file', file.fileName)}
                            onDragEnd={handleDragEndItem}
                            className={`${styles.fileRow} ${draggedItem?.id === file.id ? styles.dragging : ''}`}
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
                              <button
                                onClick={() => handleDownload(file.id, file.fileName)}
                                className={styles.actionIconBtn}
                                title="Download File"
                              >
                                <Download size={15} />
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
      </main>
    </div>
  );
}
