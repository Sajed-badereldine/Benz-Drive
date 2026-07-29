'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import styles from './UploadWidget.module.css';

export interface UploadTask {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedBytes: number;
  percent: number;
  status: 'uploading' | 'completed' | 'error';
  errorMsg?: string;
}

interface UploadWidgetProps {
  tasks: UploadTask[];
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const UploadWidget: React.FC<UploadWidgetProps> = ({ tasks, onClose }) => {
  const [isMinimized, setIsMinimized] = useState(false);

  if (tasks.length === 0) return null;

  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  let titleText = '';
  if (uploadingCount > 0) {
    titleText = `Uploading ${uploadingCount} ${uploadingCount === 1 ? 'item' : 'items'}`;
  } else {
    titleText = `${completedCount} ${completedCount === 1 ? 'upload' : 'uploads'} complete`;
  }

  return (
    <div className={styles.widgetContainer}>
      <div className={styles.widgetHeader} onClick={() => setIsMinimized(!isMinimized)}>
        <span className={styles.widgetTitle}>
          {uploadingCount > 0 && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0077be', display: 'inline-block' }} />
          )}
          {titleText}
        </span>

        <div className={styles.headerActions} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className={styles.iconBtn}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button onClick={onClose} className={styles.iconBtn} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className={styles.itemList}>
          {tasks.map((task) => {
            const radius = 10;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (task.percent / 100) * circumference;

            return (
              <div key={task.id} className={styles.itemRow}>
                <div className={styles.itemInfo}>
                  <div className={styles.fileIconWrapper}>
                    <FileText size={18} style={{ color: '#0077be' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={styles.itemName} title={task.fileName}>
                      {task.fileName}
                    </div>
                    <div className={styles.itemMeta}>
                      {task.status === 'uploading' && (
                        <span>
                          {formatBytes(task.uploadedBytes)} of {formatBytes(task.sizeBytes)}
                        </span>
                      )}
                      {task.status === 'completed' && <span>{formatBytes(task.sizeBytes)}</span>}
                      {task.status === 'error' && (
                        <span style={{ color: '#ef4444' }}>{task.errorMsg || 'Upload failed'}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.progressSection}>
                  {task.status === 'uploading' && (
                    <div className={styles.progressRing}>
                      <svg className={styles.progressRingSvg}>
                        <circle
                          className={styles.progressRingCircleBg}
                          cx="14"
                          cy="14"
                          r={radius}
                          fill="transparent"
                        />
                        <circle
                          className={styles.progressRingCircleFg}
                          cx="14"
                          cy="14"
                          r={radius}
                          fill="transparent"
                          strokeDasharray={`${circumference} ${circumference}`}
                          strokeDashoffset={strokeDashoffset}
                        />
                      </svg>
                      <span className={styles.percentText}>{task.percent}%</span>
                    </div>
                  )}

                  {task.status === 'completed' && (
                    <div className={styles.successBadge}>
                      <CheckCircle2 size={20} />
                    </div>
                  )}

                  {task.status === 'error' && (
                    <div className={styles.errorBadge}>
                      <AlertCircle size={20} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
