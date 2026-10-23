import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { DatabaseEngine, ConnectionProfile, ConnectionGroup } from '../types';
import {
  X,
  Plus,
  FolderPlus,
  Trash2,
  Check,
  ChevronRight,
  ChevronDown,
  Server,
  Shield,
  ShieldCheck,
  GripVertical,
  Play,
  Pencil,
  Copy,
  FileCode,
  FolderOpen,
  Link,
  AlertCircle,
  Key,
  FileKey,
  Eye,
  EyeOff,
  Search,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Database,
  UploadCloud,
  CheckCircle2,
} from 'lucide-react';
import { HeartbeatDot, HeartbeatColor } from './HeartbeatDot';
import { BorderChase } from './BorderChase';
import { parseConnectionUrl, serializeConnectionUrl, ParsedConnectionUrl } from '../utils/connectionUrl';
import { parseConnectionFile, ImportedConnectionItem } from '../utils/connectionImport';
import { testRealConnection } from '../services/dbService';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

interface DraggedItem {
  type: 'group' | 'connection';
  id: string;
  groupId?: string;
}

interface DropIndicator {
  type: 'group' | 'connection';
  id: string;
  position: 'before' | 'after' | 'inside';
}

import {
  ConnectorIcon,
  CONNECTOR_METADATA,
  ALL_TABLEPLUS_CONNECTORS,
} from './ConnectorIcon';

const CONNECTOR_CATEGORIES = [
  { id: 'all', label: 'All Drivers', count: 22 },
  { id: 'sql', label: 'Relational SQL', count: 10 },
  { id: 'nosql', label: 'NoSQL & Cache', count: 5 },
  { id: 'cloud', label: 'Cloud & DW', count: 4 },
  { id: 'embedded', label: 'Embedded', count: 3 },
] as const;

type ConnectorCategory = typeof CONNECTOR_CATEGORIES[number]['id'];

const getCategoryLabel = (category?: string) => {
  switch (category) {
    case 'sql':
      return 'Relational SQL';
    case 'nosql':
      return 'NoSQL & Key-Value';
    case 'cloud':
      return 'Cloud & DW';
    case 'embedded':
      return 'Embedded & Local';
    default:
      return 'Database Driver';
  }
};


const COLOR_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  rose: { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-500/30', dot: 'bg-rose-500' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-500/30', dot: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-500/30', dot: 'bg-emerald-500' },
  sky: { bg: 'bg-sky-50 dark:bg-sky-950/30', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-500/30', dot: 'bg-sky-500' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-500/30', dot: 'bg-purple-500' },
};

const GROUP_COLOR_MAP: Record<string, HeartbeatColor> = {
  rose: 'red',
  amber: 'amber',
  emerald: 'green',
  sky: 'sky',
  purple: 'purple',
};

export const ConnectionModal = () => {
  const {
    isConnectionModalOpen,
    setConnectionModalOpen,
    connectionGroups,
    connections,
    activeConnection,
    addConnectionGroup,
    deleteConnectionGroup,
    addConnection,
    updateConnection,
    deleteConnection,
    switchActiveConnection,
    reorderConnectionGroups,
    moveConnection,
    showToast,
  } = useAppStore();

  const [selectedConnId, setSelectedConnId] = useState<string | null>(activeConnection?.id || null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [creationStep, setCreationStep] = useState<'select-engine' | 'configure'>('select-engine');
  const [selectedCategory, setSelectedCategory] = useState<ConnectorCategory>('all');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newConnMethod, setNewConnMethod] = useState<'catalog' | 'url' | 'file'>('catalog');
  const [urlInputValue, setUrlInputValue] = useState('');
  const [parsedUrlResult, setParsedUrlResult] = useState<ParsedConnectionUrl | null>(null);
  const [urlParseError, setUrlParseError] = useState<string | null>(null);

  // File import state
  const [importedFileItems, setImportedFileItems] = useState<ImportedConnectionItem[]>([]);
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [connectorSearch, setConnectorSearch] = useState('');

  // Auto-parse URL as user types/pastes
  useEffect(() => {
    const trimmed = urlInputValue.trim();
    if (!trimmed) {
      setParsedUrlResult(null);
      setUrlParseError(null);
      return;
    }
    try {
      const parsed = parseConnectionUrl(trimmed);
      setParsedUrlResult(parsed);
      setUrlParseError(null);
    } catch (err: any) {
      setParsedUrlResult(null);
      setUrlParseError(err.message || 'Invalid connection URL format');
    }
  }, [urlInputValue]);

  const filteredConnectors = ALL_TABLEPLUS_CONNECTORS.filter((item) => {
    const query = connectorSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      item.label.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query) ||
      item.tag.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query);
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropIndicator | null>(null);

  // Context Menu State
  const [connContextPos, setConnContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetConn, setTargetConn] = useState<ConnectionProfile | null>(null);
  const [groupContextPos, setGroupContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetGroup, setTargetGroup] = useState<ConnectionGroup | null>(null);

  // In-App Delete Confirmation Modal State (replaces broken window.confirm)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'connection' | 'group';
    id: string;
    name: string;
    count?: number;
  } | null>(null);

  // Flexible Target Group Combobox / Dropdown state
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isCreatingCustomGroup, setIsCreatingCustomGroup] = useState(false);
  const [customGroupName, setCustomGroupName] = useState('');
  const [customGroupTag, setCustomGroupTag] = useState('DEV');
  const [customGroupColor, setCustomGroupColor] = useState('sky');
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const groupSearchInputRef = useRef<HTMLInputElement>(null);

  // Group Form state
  const [groupName, setGroupName] = useState('');
  const [groupTag, setGroupTag] = useState<'PROD' | 'QA' | 'DEV' | 'LOCAL'>('DEV');
  const [groupColor, setGroupColor] = useState<string>('emerald');

  // Connection Form state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [formData, setFormData] = useState<Omit<ConnectionProfile, 'id'>>({
    name: 'new-postgres-connection',
    groupId: connectionGroups[0]?.id || 'group-prod',
    engine: 'postgres',
    env: 'local',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    username: 'postgres',
    password: '',
    useSsh: false,
    sshHost: '',
    sshPort: 22,
    sshUser: 'ec2-user',
    sshPassword: '',
    useSshKey: true,
    sshKeyPath: 'id_rsa',
    sshPassphrase: '',
    accountIdentifier: '',
    warehouse: '',
    active: false,
    latencyMs: 1.0,
    safeMode: 'silent',
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testLatency, setTestLatency] = useState(1.4);

  // Sync selected connection when opening or changing selection
  useEffect(() => {
    if (!isCreatingNew && selectedConnId) {
      const conn = connections.find((c) => c.id === selectedConnId);
      if (conn) {
        setFormData({
          name: conn.name,
          groupId: conn.groupId,
          engine: conn.engine,
          env: conn.env,
          host: conn.host,
          port: conn.port,
          database: conn.database,
          username: conn.username,
          password: conn.password || '',
          useSsh: conn.useSsh || false,
          sshHost: conn.sshHost || '',
          sshPort: conn.sshPort || 22,
          sshUser: conn.sshUser || '',
          sshPassword: conn.sshPassword || '',
          useSshKey: conn.useSshKey ?? true,
          sshKeyPath: conn.sshKeyPath || (conn.useSsh ? 'id_rsa' : ''),
          sshPassphrase: conn.sshPassphrase || '',
          accountIdentifier: conn.accountIdentifier || '',
          warehouse: conn.warehouse || '',
          active: conn.active,
          latencyMs: conn.latencyMs,
          safeMode: conn.safeMode || (conn.env === 'prod' ? 'alert-2' : 'silent'),
        });
      }
    }
  }, [selectedConnId, isCreatingNew, connections]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlConn = urlParams.get('conn');
    if (urlConn) {
      setSelectedConnId(urlConn);
    }
  }, []);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    const newGroup = addConnectionGroup({
      name: groupName.trim(),
      tag: groupTag,
      color: groupColor,
    });

    setGroupName('');
    setIsCreatingGroup(false);
    setFormData((prev) => ({ ...prev, groupId: newGroup.id }));
  };

  // Close dropdown on click outside
  useEffect(() => {
    if (!isGroupDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setIsGroupDropdownOpen(false);
        setIsCreatingCustomGroup(false);
        setGroupSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isGroupDropdownOpen]);

  // Auto-focus search input when opening Target Group dropdown
  useEffect(() => {
    if (isGroupDropdownOpen) {
      setTimeout(() => groupSearchInputRef.current?.focus(), 50);
    }
  }, [isGroupDropdownOpen]);

  const handleSelectGroup = (groupId: string) => {
    setFormData((prev) => ({ ...prev, groupId }));
    setIsGroupDropdownOpen(false);
    setIsCreatingCustomGroup(false);
    setGroupSearchQuery('');
  };

  const handleCreateGroupInline = (name: string, tag?: string, color?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const finalTag = (tag || trimmed.slice(0, 4)).trim().toUpperCase() || 'DEV';
    const finalColor = color || 'sky';
    const newGroup = addConnectionGroup({
      name: trimmed,
      tag: finalTag,
      color: finalColor,
    });
    setFormData((prev) => ({ ...prev, groupId: newGroup.id }));
    setIsGroupDropdownOpen(false);
    setIsCreatingCustomGroup(false);
    setGroupSearchQuery('');
    setCustomGroupName('');
    showToast(`Created & assigned to "${newGroup.name}"`);
  };

  const handleStartNewConnection = (groupId?: string) => {
    setIsCreatingNew(true);
    setCreationStep('select-engine');
    setNewConnMethod('catalog');
    setSelectedCategory('all');
    setSelectedConnId(null);
    setTestSuccess(false);
    setTestError(null);
    setConnectorSearch('');
    setUrlInputValue('');
    setParsedUrlResult(null);
    setUrlParseError(null);
    setImportedFileItems([]);
    setFileImportError(null);
    setImportedFileName(null);
    setFormData({
      name: 'new-postgres-connection',
      groupId: groupId || connectionGroups[0]?.id || 'group-prod',
      engine: 'postgres',
      env: 'local',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      username: 'postgres',
      password: '',
      useSsh: false,
      sshHost: '',
      sshPort: 22,
      sshUser: 'ec2-user',
      sshPassword: '',
      useSshKey: true,
      sshKeyPath: 'id_rsa',
      sshPassphrase: '',
      accountIdentifier: '',
      warehouse: '',
      active: false,
      latencyMs: 1.2,
      safeMode: 'silent',
    });
  };

  const handleSelectConnection = (conn: ConnectionProfile) => {
    setIsCreatingNew(false);
    setCreationStep('configure');
    setSelectedConnId(conn.id);
    setTestSuccess(false);
    setTestError(null);
  };

  const handleEngineChange = (engine: DatabaseEngine) => {
    const meta = CONNECTOR_METADATA[engine] || CONNECTOR_METADATA.generic;
    setFormData((prev) => {
      let defaultDb = prev.database;
      if (engine === 'redis') {
        defaultDb = '0';
      } else if (meta.id === 'sqlite' || meta.id === 'duckdb') {
        defaultDb = `${meta.id}.db`;
      } else if (!defaultDb || defaultDb === '0' || defaultDb === 'postgres' || defaultDb === 'sqlite.db' || defaultDb === 'duckdb.db') {
        defaultDb = meta.id;
      }

      let defaultUser = prev.username;
      if (engine === 'redis') {
        defaultUser = '';
      } else if (engine === 'postgres') {
        defaultUser = 'postgres';
      } else if (engine === 'mysql' || engine === 'mariadb') {
        defaultUser = 'root';
      }

      return {
        ...prev,
        engine,
        port: meta.defaultPort > 0 ? meta.defaultPort : prev.port,
        name: isCreatingNew && (prev.name.startsWith('new-') || !prev.name)
          ? `new-${meta.id}-connection`
          : prev.name,
        database: defaultDb,
        username: defaultUser,
      };
    });
  };

  const handleApplyUrlToForm = () => {
    if (!parsedUrlResult) return;
    const meta = CONNECTOR_METADATA[parsedUrlResult.engine] || CONNECTOR_METADATA.generic;
    setFormData((prev) => ({
      ...prev,
      name: parsedUrlResult.name || `${parsedUrlResult.database || meta.label} (${parsedUrlResult.host})`,
      engine: parsedUrlResult.engine,
      env: parsedUrlResult.env,
      host: parsedUrlResult.host,
      port: parsedUrlResult.port,
      database: parsedUrlResult.database,
      username: parsedUrlResult.username,
      password: parsedUrlResult.password || '',
      useSsh: parsedUrlResult.useSsh || false,
      sshHost: parsedUrlResult.sshHost || '',
      sshPort: parsedUrlResult.sshPort || 22,
      sshUser: parsedUrlResult.sshUser || '',
      sshPassword: parsedUrlResult.sshPassword || '',
      useSshKey: parsedUrlResult.useSshKey ?? true,
      sshKeyPath: parsedUrlResult.sshKeyPath || (parsedUrlResult.useSsh ? 'id_rsa' : ''),
    }));
    setCreationStep('configure');
    showToast(`Loaded URL settings for ${meta.label}`);
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const items = parseConnectionFile(text, file.name);
        setImportedFileItems(items);
        setImportedFileName(file.name);
        setFileImportError(null);
        showToast(`Discovered ${items.length} connection(s) from ${file.name}`);
      } catch (err: any) {
        setImportedFileItems([]);
        setFileImportError(err.message || 'Failed to parse file');
      }
    };
    reader.readAsText(file);
  };

  const handleApplyFileItemToForm = (item: ImportedConnectionItem) => {
    setFormData((prev) => ({
      ...prev,
      name: item.name,
      engine: item.engine,
      env: item.env,
      host: item.host,
      port: item.port,
      database: item.database,
      username: item.username,
      password: item.password || '',
      useSsh: item.useSsh || false,
      sshHost: item.sshHost || '',
      sshPort: item.sshPort || 22,
      sshUser: item.sshUser || '',
      sshPassword: item.sshPassword || '',
      useSshKey: item.useSshKey ?? true,
      sshKeyPath: item.sshKeyPath || '',
    }));
    setCreationStep('configure');
    showToast(`Loaded "${item.name}" from ${item.sourceTool.toUpperCase()}`);
  };

  const handleBatchImportAll = () => {
    if (importedFileItems.length === 0) return;
    let firstId = '';
    importedFileItems.forEach((item, idx) => {
      let targetGroupId = connectionGroups[0]?.id || 'group-prod';
      if (item.groupName) {
        const existingGroup = connectionGroups.find(
          (g) => g.name.toLowerCase() === item.groupName!.toLowerCase()
        );
        if (existingGroup) {
          targetGroupId = existingGroup.id;
        } else {
          const newGrp = addConnectionGroup({
            name: item.groupName,
            tag: item.env.toUpperCase().slice(0, 4) || 'DEV',
            color: item.env === 'prod' ? 'rose' : item.env === 'staging' ? 'amber' : 'sky',
          });
          targetGroupId = newGrp.id;
        }
      }

      const created = addConnection({
        name: item.name,
        groupId: targetGroupId,
        engine: item.engine,
        env: item.env,
        host: item.host,
        port: item.port,
        database: item.database,
        username: item.username,
        password: item.password || '',
        useSsh: item.useSsh || false,
        sshHost: item.sshHost || '',
        sshPort: item.sshPort || 22,
        sshUser: item.sshUser || '',
        sshPassword: item.sshPassword || '',
        useSshKey: item.useSshKey ?? true,
        sshKeyPath: item.sshKeyPath || '',
        active: false,
        latencyMs: 1.0,
      });

      if (idx === 0) firstId = created.id;
    });

    setIsCreatingNew(false);
    if (firstId) setSelectedConnId(firstId);
    showToast(`Successfully imported ${importedFileItems.length} connections!`);
  };

  const handleSaveOnly = () => {
    if (!formData.name.trim()) {
      alert('Please enter a valid connection name');
      return;
    }

    const status: 'connected' | 'connecting' = testSuccess ? 'connected' : 'connecting';
    const payload = {
      ...formData,
      connectionStatus: status,
      active: false,
    };

    if (isCreatingNew) {
      const created = addConnection(payload);
      setIsCreatingNew(false);
      setSelectedConnId(created.id);
      showToast(`Saved new connection: "${created.name}"`);
    } else if (selectedConnId) {
      updateConnection(selectedConnId, payload);
      showToast(`Updated connection: "${formData.name}"`);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestSuccess(false);
    setTestError(null);
    try {
      const profileToTest: ConnectionProfile = {
        ...formData,
        id: selectedConnId || 'temp-test-id',
      };
      const res = await testRealConnection(profileToTest);
      setIsTesting(false);
      if (res.success) {
        setTestSuccess(true);
        setTestLatency(res.latency_ms || 1.2);
        setTestError(null);
      } else {
        setTestSuccess(false);
        setTestError(res.message || 'Connection failed: Host unreachable');
      }
    } catch (err: any) {
      setIsTesting(false);
      setTestSuccess(false);
      setTestError(String(err?.message || err || 'Connection failed'));
    }
  };

  const handleSaveAndConnect = async () => {
    if (!formData.name.trim()) {
      alert('Please enter a valid connection name');
      return;
    }

    let status: 'connected' | 'connecting' | 'failed' = 'connected';
    let lastError: string | undefined = undefined;

    if (testError) {
      status = 'failed';
      lastError = testError;
    } else if (!testSuccess) {
      setIsTesting(true);
      const res = await testRealConnection({ ...formData, id: selectedConnId || 'temp' });
      setIsTesting(false);
      if (res.success) {
        status = 'connected';
      } else {
        status = 'failed';
        lastError = res.message;
        setTestError(res.message);
        setTestSuccess(false);
        showToast(`⚠️ Connection failed: ${res.message}`);
      }
    }

    const payload = {
      ...formData,
      connectionStatus: status,
      lastError,
      active: true,
    };

    if (isCreatingNew) {
      const created = addConnection(payload);
      switchActiveConnection(created.id);
    } else if (selectedConnId) {
      updateConnection(selectedConnId, payload);
      switchActiveConnection(selectedConnId);
    }

    setConnectionModalOpen(false);
  };

  const handleDeleteConnection = (connId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const conn = connections.find((c) => c.id === connId);
    if (conn) {
      setDeleteConfirmTarget({ type: 'connection', id: conn.id, name: conn.name });
    }
  };

  const handleDeleteGroup = (groupId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const group = connectionGroups.find((g) => g.id === groupId);
    if (group) {
      const count = connections.filter((c) => c.groupId === groupId).length;
      setDeleteConfirmTarget({
        type: 'group',
        id: group.id,
        name: group.name,
        count,
      });
    }
  };

  const handleExecuteDelete = () => {
    if (!deleteConfirmTarget) return;

    if (deleteConfirmTarget.type === 'connection') {
      const connId = deleteConfirmTarget.id;
      const connName = deleteConfirmTarget.name;
      deleteConnection(connId);
      showToast(`🗑️ Deleted connection "${connName}"`);
      if (selectedConnId === connId) {
        const remaining = connections.filter((c) => c.id !== connId);
        if (remaining.length > 0) {
          setSelectedConnId(remaining[0].id);
        } else {
          handleStartNewConnection();
        }
      }
    } else {
      const groupId = deleteConfirmTarget.id;
      const groupName = deleteConfirmTarget.name;
      if (deleteConfirmTarget.count && deleteConfirmTarget.count > 0) {
        connections
          .filter((c) => c.groupId === groupId)
          .forEach((c) => deleteConnection(c.id));
      }
      deleteConnectionGroup(groupId);
      showToast(`🗑️ Deleted group "${groupName}"`);

      // Update selected connection if it was inside the deleted group
      const remaining = connections.filter((c) => c.groupId !== groupId);
      if (remaining.length > 0) {
        setSelectedConnId(remaining[0].id);
      } else {
        handleStartNewConnection();
      }
    }

    setDeleteConfirmTarget(null);
  };

  // Keyboard shortcut: Escape to close delete modal, Enter to confirm; Backspace/Delete to trigger delete on selected connection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (deleteConfirmTarget) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setDeleteConfirmTarget(null);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleExecuteDelete();
        }
        return;
      }

      // Check if user is typing in form inputs
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && !isCreatingNew && selectedConnId) {
        const conn = connections.find((c) => c.id === selectedConnId);
        if (conn) {
          e.preventDefault();
          setDeleteConfirmTarget({ type: 'connection', id: conn.id, name: conn.name });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirmTarget, isCreatingNew, selectedConnId, connections, connectionGroups]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleGroupDragStart = (e: React.DragEvent, groupId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'group', id: groupId }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem({ type: 'group', id: groupId });
  };

  const handleGroupDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedItem) return;

    if (draggedItem.type === 'group') {
      if (draggedItem.id === groupId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
      setDropTarget({ type: 'group', id: groupId, position: pos });
    } else if (draggedItem.type === 'connection') {
      // Hovering connection over a group header means dropping into this group
      setDropTarget({ type: 'group', id: groupId, position: 'inside' });
    }
  };

  const handleGroupDragLeave = (e: React.DragEvent, groupId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dropTarget?.id === groupId) {
        setDropTarget(null);
      }
    }
  };

  const handleGroupDrop = (e: React.DragEvent, targetGroup: { id: string; name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem) return;

    if (draggedItem.type === 'group' && draggedItem.id !== targetGroup.id && dropTarget?.type === 'group') {
      const pos = dropTarget.position === 'after' ? 'after' : 'before';
      reorderConnectionGroups(draggedItem.id, targetGroup.id, pos);
      showToast('Reordered groups');
    } else if (draggedItem.type === 'connection') {
      const conn = connections.find((c) => c.id === draggedItem.id);
      moveConnection(draggedItem.id, targetGroup.id);
      setCollapsedGroups((prev) => ({ ...prev, [targetGroup.id]: false }));
      showToast(`Moved '${conn?.name || 'connection'}' to group '${targetGroup.name}'`);
    }

    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleConnDragStart = (e: React.DragEvent, conn: ConnectionProfile) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'connection', id: conn.id, groupId: conn.groupId }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem({ type: 'connection', id: conn.id, groupId: conn.groupId });
  };

  const handleConnDragOver = (e: React.DragEvent, conn: ConnectionProfile) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedItem || draggedItem.type !== 'connection' || draggedItem.id === conn.id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setDropTarget({ type: 'connection', id: conn.id, position: pos });
  };

  const handleConnDragLeave = (e: React.DragEvent, connId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dropTarget?.id === connId) {
        setDropTarget(null);
      }
    }
  };

  const handleConnDrop = (e: React.DragEvent, targetConn: ConnectionProfile) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem || draggedItem.type !== 'connection' || draggedItem.id === targetConn.id) return;

    const pos = dropTarget?.position === 'after' ? 'after' : 'before';
    const sourceConn = connections.find((c) => c.id === draggedItem.id);
    const targetGroup = connectionGroups.find((g) => g.id === targetConn.groupId);
    const isCrossGroup = draggedItem.groupId !== targetConn.groupId;

    moveConnection(draggedItem.id, targetConn.groupId, targetConn.id, pos);

    if (isCrossGroup) {
      setCollapsedGroups((prev) => ({ ...prev, [targetConn.groupId]: false }));
      showToast(`Moved '${sourceConn?.name || 'connection'}' to '${targetGroup?.name || 'group'}'`);
    } else {
      showToast(`Reordered '${sourceConn?.name || 'connection'}'`);
    }

    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleEmptyGroupDrop = (e: React.DragEvent, targetGroup: { id: string; name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem || draggedItem.type !== 'connection') return;

    const sourceConn = connections.find((c) => c.id === draggedItem.id);
    moveConnection(draggedItem.id, targetGroup.id);
    setCollapsedGroups((prev) => ({ ...prev, [targetGroup.id]: false }));
    showToast(`Moved '${sourceConn?.name || 'connection'}' to '${targetGroup.name}'`);

    setDraggedItem(null);
    setDropTarget(null);
  };

  if (!isConnectionModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl h-[720px] max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/10 animate-in zoom-in-95 duration-150 font-sans">
        
        {/* Titlebar */}
        <div className="h-11 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Connection Manager</span>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded font-mono font-medium">
              OSS Edition
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                handleStartNewConnection();
                setNewConnMethod('file');
              }}
              className="px-2.5 py-1 bg-purple-50 dark:bg-purple-500/15 hover:bg-purple-100 dark:hover:bg-purple-500/25 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer flex items-center space-x-1.5"
              title="Import connections from TablePlus, DBeaver, pgAdmin or JSON files"
            >
              <FileCode className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Import File / Tools</span>
            </button>
            <button
              onClick={() => setConnectionModalOpen(false)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition active:scale-95 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Split */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Tree */}
          <div className="w-72 bg-slate-50 dark:bg-slate-950/70 border-r border-slate-200 dark:border-slate-800 p-3 space-y-3 select-none overflow-y-auto">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <span>Groups & Databases</span>
              <div className="flex items-center space-x-1">
                {/* New Group Button */}
                <button
                  onClick={() => setIsCreatingGroup(!isCreatingGroup)}
                  className={`p-1 rounded transition-all duration-150 active:scale-95 cursor-pointer ${
                    isCreatingGroup ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-800 dark:text-indigo-300' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                  title="Create New Group (Folder)"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>

                {/* New Connection Button */}
                <button
                  onClick={() => {
                    handleStartNewConnection();
                    setIsCreatingGroup(false);
                  }}
                  className={`p-1 rounded transition-all duration-150 active:scale-95 cursor-pointer ${
                    isCreatingNew ? 'bg-sky-100 dark:bg-sky-500/30 text-sky-800 dark:text-sky-300' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                  title="Create New Connection"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Smooth Collapsible Inline Create Group Card */}
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-250 ease-out ${
                isCreatingGroup ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
              }`}
            >
              <div className="overflow-hidden">
                <form onSubmit={handleCreateGroup} className="p-3 bg-indigo-50/80 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/40 rounded-xl space-y-2 text-xs shadow-md mb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-800 dark:text-indigo-300">New Group</span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingGroup(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Group name (e.g. AWS Lab)..."
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      autoFocus
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 shadow-2xs font-sans"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">Environment Tag:</span>
                    <select
                      value={groupTag}
                      onChange={(e) => setGroupTag(e.target.value as any)}
                      className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-800 dark:text-slate-200 cursor-pointer shadow-2xs"
                    >
                      <option value="PROD">PROD</option>
                      <option value="QA">QA</option>
                      <option value="DEV">DEV</option>
                      <option value="LOCAL">LOCAL</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">Color:</span>
                    <div className="flex items-center space-x-1.5">
                      {['rose', 'amber', 'emerald', 'sky', 'purple'].map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setGroupColor(col)}
                          className={`w-3.5 h-3.5 rounded-full ${COLOR_MAP[col]?.dot} transition-transform cursor-pointer ${
                            groupColor === col ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={!groupName.trim()}
                    className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Create Group
                  </button>
                </form>
              </div>
            </div>

            {/* List of Groups & Connections with smooth accordions & Drag-and-Drop */}
            <div className="space-y-3">
              {connectionGroups.map((group) => {
                const groupConns = connections.filter((c) => c.groupId === group.id);
                const isCollapsed = !!collapsedGroups[group.id];
                const colorInfo = COLOR_MAP[group.color] || COLOR_MAP.rose;
                const dotColor = GROUP_COLOR_MAP[group.color] || 'red';

                const isGroupDragged = draggedItem?.type === 'group' && draggedItem.id === group.id;
                const isGroupDropTarget = dropTarget?.id === group.id;

                return (
                  <div key={group.id} className="space-y-1 relative">
                    {/* Group Header with rotating chevron & drag-and-drop */}
                    <div
                      draggable={true}
                      onDragStart={(e) => handleGroupDragStart(e, group.id)}
                      onDragEnd={() => {
                        setDraggedItem(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(e) => handleGroupDragOver(e, group.id)}
                      onDragLeave={(e) => handleGroupDragLeave(e, group.id)}
                      onDrop={(e) => handleGroupDrop(e, group)}
                      onClick={() => toggleGroupCollapse(group.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setConnContextPos(null);
                        setGroupContextPos({ x: e.clientX, y: e.clientY });
                        setTargetGroup(group);
                      }}
                      className={`relative flex items-center justify-between px-2 py-1.5 rounded-lg ${colorInfo.bg} ${colorInfo.text} font-bold text-xs border ${colorInfo.border} cursor-grab active:cursor-grabbing hover:brightness-110 transition-all duration-150 select-none group ${
                        isGroupDragged ? 'opacity-40 scale-[0.98] border-dashed border-sky-400' : ''
                      } ${
                        isGroupDropTarget && dropTarget.position === 'inside'
                          ? 'ring-2 ring-sky-400 bg-sky-500/25 border-sky-400 scale-[1.01] shadow-lg shadow-sky-500/25'
                          : ''
                      }`}
                    >
                      {/* Insertion line indicator above group */}
                      {isGroupDropTarget && dropTarget.position === 'before' && (
                        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)] z-20 pointer-events-none" />
                      )}
                      {/* Insertion line indicator below group */}
                      {isGroupDropTarget && dropTarget.position === 'after' && (
                        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)] z-20 pointer-events-none" />
                      )}

                      <div className="flex items-center space-x-1.5 truncate">
                        <span title="Drag to reorder group" className="inline-flex items-center">
                          <GripVertical
                            className="w-3.5 h-3.5 text-slate-400/50 group-hover:text-slate-200 transition-colors flex-shrink-0 cursor-grab active:cursor-grabbing"
                          />
                        </span>
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform duration-200 ease-out flex-shrink-0 cursor-pointer ${
                            isCollapsed ? 'rotate-0' : 'rotate-90'
                          }`}
                        />
                        <HeartbeatDot color={dotColor} size="xs" showWave={false} />
                        <span className="truncate">{group.name}</span>
                      </div>

                      <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
                        <span className="text-[9px] px-1 bg-black/30 rounded font-mono uppercase">{group.tag}</span>
                        {/* Quick Add Connection in this group */}
                        <button
                          type="button"
                          draggable={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartNewConnection(group.id);
                          }}
                          className="p-0.5 hover:bg-white/10 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition active:scale-95 cursor-pointer"
                          title={`Add connection to ${group.name}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        {connectionGroups.length > 1 && (
                          <button
                            type="button"
                            draggable={false}
                            onClick={(e) => handleDeleteGroup(group.id, e)}
                            className="p-0.5 hover:bg-rose-500/20 rounded text-slate-300 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition active:scale-95 cursor-pointer"
                            title={groupConns.length > 0 ? `Delete group and ${groupConns.length} connection(s)` : `Delete empty group "${group.name}"`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Smooth Accordion Container for Group Connections */}
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-240 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className={`ml-3 pl-2 border-l ${colorInfo.border} space-y-1 text-xs pt-1`}>
                          {groupConns.length === 0 ? (
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (draggedItem?.type === 'connection') {
                                  setDropTarget({ type: 'group', id: group.id, position: 'inside' });
                                }
                              }}
                              onDragLeave={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                  if (dropTarget?.id === group.id && dropTarget.position === 'inside') {
                                    setDropTarget(null);
                                  }
                                }
                              }}
                              onDrop={(e) => handleEmptyGroupDrop(e, group)}
                              className={`px-2 py-2 rounded-lg border border-dashed text-[11px] text-center transition-all ${
                                dropTarget?.id === group.id && dropTarget.position === 'inside'
                                  ? 'border-sky-400 bg-sky-500/25 text-sky-200 shadow-md shadow-sky-500/20'
                                  : 'border-slate-800/80 text-slate-500 hover:border-slate-700'
                              }`}
                            >
                              {draggedItem?.type === 'connection'
                                ? 'Drop connection here'
                                : 'No connections yet. Drag here or click +'}
                            </div>
                          ) : (
                            groupConns.map((conn) => {
                              const isSelected = !isCreatingNew && selectedConnId === conn.id;
                              const isConnActive = conn.active;
                              const isConnDragged = draggedItem?.type === 'connection' && draggedItem.id === conn.id;
                              const isConnDropTarget = dropTarget?.id === conn.id;

                              return (
                                <div
                                  key={conn.id}
                                  draggable={true}
                                  onDragStart={(e) => handleConnDragStart(e, conn)}
                                  onDragEnd={() => {
                                    setDraggedItem(null);
                                    setDropTarget(null);
                                  }}
                                  onDragOver={(e) => handleConnDragOver(e, conn)}
                                  onDragLeave={(e) => handleConnDragLeave(e, conn.id)}
                                  onDrop={(e) => handleConnDrop(e, conn)}
                                  onClick={() => handleSelectConnection(conn)}
                                  onDoubleClick={() => {
                                    switchActiveConnection(conn.id);
                                    setConnectionModalOpen(false);
                                    showToast(`Connected to ${conn.name}`);
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setGroupContextPos(null);
                                    setConnContextPos({ x: e.clientX, y: e.clientY });
                                    setTargetConn(conn);
                                  }}
                                  className={`relative px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing font-medium flex items-center justify-between transition-all duration-150 select-none group ${
                                    isSelected
                                      ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-900 dark:text-sky-200 border border-sky-300 dark:border-sky-500/40 shadow-xs'
                                      : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  } ${
                                    isConnDragged
                                      ? 'opacity-40 scale-[0.98] border border-dashed border-sky-400 bg-sky-950/20'
                                      : ''
                                  }`}
                                >
                                  {/* Insertion indicator before */}
                                  {isConnDropTarget && dropTarget.position === 'before' && (
                                    <div className="absolute -top-1 left-1 right-1 h-0.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)] z-20 pointer-events-none" />
                                  )}
                                  {/* Insertion indicator after */}
                                  {isConnDropTarget && dropTarget.position === 'after' && (
                                    <div className="absolute -bottom-1 left-1 right-1 h-0.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)] z-20 pointer-events-none" />
                                  )}

                                  <div className="flex items-center space-x-1.5 truncate">
                                    <span title="Drag to reorder or move to another group" className="inline-flex items-center">
                                      <GripVertical
                                        className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-20 group-hover:opacity-90 transition-opacity flex-shrink-0 cursor-grab active:cursor-grabbing"
                                      />
                                    </span>
                                    <ConnectorIcon engine={conn.engine} size="xs" />
                                    <span className="truncate">{conn.name}</span>
                                  </div>

                                  <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
                                    {isConnActive && (
                                      <HeartbeatDot color="green" size="xs" showWave={true} />
                                    )}
                                    <button
                                      type="button"
                                      draggable={false}
                                      onClick={(e) => handleDeleteConnection(conn.id, e)}
                                      className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition ml-1 active:scale-95 cursor-pointer"
                                      title="Delete connection"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Ungrouped connections if any */}
              {(() => {
                const ungroupedConns = connections.filter(
                  (c) => !c.groupId || c.groupId === 'ungrouped' || !connectionGroups.some((g) => g.id === c.groupId)
                );
                if (ungroupedConns.length === 0) return null;
                const isCollapsed = !!collapsedGroups['ungrouped'];

                return (
                  <div className="space-y-1 pt-1">
                    <div
                      onClick={() => toggleGroupCollapse('ungrouped')}
                      className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1 px-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-900 rounded-lg cursor-pointer transition select-none group"
                    >
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform duration-200 text-slate-400 ${
                            isCollapsed ? '' : 'rotate-90'
                          }`}
                        />
                        <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-slate-600 dark:text-slate-300">Ungrouped</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {ungroupedConns.length}
                      </span>
                    </div>

                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-240 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="ml-3 pl-2 border-l border-slate-300 dark:border-slate-800 space-y-1 text-xs pt-1">
                          {ungroupedConns.map((conn) => {
                            const isSelected = !isCreatingNew && selectedConnId === conn.id;
                            const isConnActive = conn.active;
                            const isConnDragged = draggedItem?.type === 'connection' && draggedItem.id === conn.id;
                            const isConnDropTarget = dropTarget?.id === conn.id;

                            return (
                              <div
                                key={conn.id}
                                draggable={true}
                                onDragStart={(e) => handleConnDragStart(e, conn)}
                                onDragEnd={() => {
                                  setDraggedItem(null);
                                  setDropTarget(null);
                                }}
                                onDragOver={(e) => handleConnDragOver(e, conn)}
                                onDragLeave={(e) => handleConnDragLeave(e, conn.id)}
                                onDrop={(e) => handleConnDrop(e, conn)}
                                onClick={() => handleSelectConnection(conn)}
                                onDoubleClick={() => {
                                  switchActiveConnection(conn.id);
                                  setConnectionModalOpen(false);
                                  showToast(`Connected to ${conn.name}`);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setGroupContextPos(null);
                                  setConnContextPos({ x: e.clientX, y: e.clientY });
                                  setTargetConn(conn);
                                }}
                                className={`relative px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing font-medium flex items-center justify-between transition-all duration-150 select-none group ${
                                  isSelected
                                    ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-900 dark:text-sky-200 border border-sky-300 dark:border-sky-500/40 shadow-xs'
                                    : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                } ${
                                  isConnDragged
                                    ? 'opacity-40 scale-[0.98] border border-dashed border-sky-400 bg-sky-950/20'
                                    : ''
                                }`}
                              >
                                {isConnDropTarget && dropTarget.position === 'before' && (
                                  <div className="absolute -top-1 left-1 right-1 h-0.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)] z-20 pointer-events-none" />
                                )}
                                {isConnDropTarget && dropTarget.position === 'after' && (
                                  <div className="absolute -bottom-1 left-1 right-1 h-0.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,0.9)] z-20 pointer-events-none" />
                                )}

                                <div className="flex items-center space-x-1.5 truncate">
                                  <span title="Drag to reorder or move to another group" className="inline-flex items-center">
                                    <GripVertical
                                      className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-20 group-hover:opacity-90 transition-opacity flex-shrink-0 cursor-grab active:cursor-grabbing"
                                    />
                                  </span>
                                  <ConnectorIcon engine={conn.engine} size="xs" />
                                  <span className="truncate">{conn.name}</span>
                                </div>

                                <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
                                  {isConnActive && (
                                    <HeartbeatDot color="green" size="xs" showWave={true} />
                                  )}
                                  <button
                                    type="button"
                                    draggable={false}
                                    onClick={(e) => handleDeleteConnection(conn.id, e)}
                                    className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition ml-1 active:scale-95 cursor-pointer"
                                    title="Delete connection"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Quick button to create new connection at bottom */}
            <button
              onClick={() => handleStartNewConnection()}
              className="w-full py-2 px-3 border border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-500/60 rounded-xl text-slate-500 dark:text-slate-400 hover:text-sky-700 dark:hover:text-sky-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Connection</span>
            </button>

          </div>

          {/* Right Pane */}
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            
            {/* Unified, Persistent Header (fixed h-12, never unmounts, never jitters) */}
            <div className="h-12 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 select-none bg-slate-50/60 dark:bg-slate-950/40">
              <div className="flex items-center space-x-2.5 min-w-0">
                {!isCreatingNew && (
                  <ConnectorIcon engine={formData.engine} size="sm" className="w-5 h-5 shrink-0" />
                )}
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {isCreatingNew ? '✨ Create New Connection' : `Editing: ${formData.name}`}
                </span>
                {!isCreatingNew && selectedConnId && (
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 font-mono shrink-0">
                    ID: {selectedConnId}
                  </span>
                )}
              </div>

              {isCreatingNew ? (
                /* Stable Step Navigation Tabs (Fixed width per tab prevents any expansion/contraction jitter) */
                <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCreationStep('select-engine')}
                    className={`w-36 h-7 rounded-md text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer select-none ${
                      creationStep === 'select-engine'
                        ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono font-bold shrink-0 ${
                        creationStep === 'select-engine'
                          ? 'bg-sky-100 dark:bg-sky-500/30 text-sky-700 dark:text-sky-300'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      1
                    </span>
                    <span className="truncate">
                      {newConnMethod === 'url' ? 'Import URL' : newConnMethod === 'file' ? 'Import File' : 'Choose Connector'}
                    </span>
                  </button>

                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                  <button
                    type="button"
                    onClick={() => setCreationStep('configure')}
                    className={`w-36 h-7 rounded-md text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer select-none ${
                      creationStep === 'configure'
                        ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono font-bold shrink-0 ${
                        creationStep === 'configure'
                          ? 'bg-sky-100 dark:bg-sky-500/30 text-sky-700 dark:text-sky-300'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      2
                    </span>
                    <span className="truncate">Connection Info</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2 shrink-0">
                  {(() => {
                    const currentMeta = CONNECTOR_METADATA[formData.engine] || CONNECTOR_METADATA.generic;
                    return (
                      <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xs">
                        <ConnectorIcon engine={formData.engine} size="xs" className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {currentMeta.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {currentMeta.tag}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs select-text">
              {isCreatingNew && creationStep === 'select-engine' ? (
                /* ========================================================================= */
                /* STEP 1: CHOOSE METHOD (CONNECTOR CATALOG / IMPORT URL / IMPORT FILE)      */
                /* ========================================================================= */
                <div className="space-y-4">
                  {/* Step 1 Entry-Point Switcher */}
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setNewConnMethod('catalog')}
                      className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                        newConnMethod === 'catalog'
                          ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Database Connectors</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewConnMethod('url')}
                      className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                        newConnMethod === 'url'
                          ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <Link className="w-3.5 h-3.5" />
                      <span>Import Connection URL</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewConnMethod('file')}
                      className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                        newConnMethod === 'file'
                          ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Import from File / Tools</span>
                    </button>
                  </div>

                  {/* OPTION 1: 22 DATABASE CONNECTORS CATALOG */}
                  {newConnMethod === 'catalog' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                            <span>Select Database Engine</span>
                            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30">
                              22 Connectors
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Select a database connector to configure host, authentication and security settings.
                          </p>
                        </div>

                        {/* Real-time search */}
                        <div className="relative w-full sm:w-64">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={connectorSearch}
                            onChange={(e) => setConnectorSearch(e.target.value)}
                            placeholder="Filter 22 connectors..."
                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 font-medium shadow-2xs"
                          />
                          {connectorSearch && (
                            <button
                              type="button"
                              onClick={() => setConnectorSearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Category Filter Tabs */}
                      <div className="flex items-center space-x-1.5 border-b border-slate-200 dark:border-slate-800 pb-2.5 overflow-x-auto">
                        {CONNECTOR_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 ${
                              selectedCategory === cat.id
                                ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/50 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                            }`}
                          >
                            <span>{cat.label}</span>
                            <span className="text-[10px] opacity-75 font-mono">({cat.count})</span>
                          </button>
                        ))}
                      </div>

                      {/* Connectors Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[350px] overflow-y-auto pr-1">
                        {filteredConnectors.map((item) => {
                          const isSelected = formData.engine === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                handleEngineChange(item.id as DatabaseEngine);
                                setCreationStep('configure');
                              }}
                              className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer group/card relative ${
                                isSelected
                                  ? 'bg-sky-50 dark:bg-sky-500/20 border-sky-400 shadow-2xs text-sky-900 dark:text-sky-100 ring-1 ring-sky-400/50'
                                  : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 hover:border-sky-300 dark:hover:border-sky-600/70 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 shadow-2xs hover:shadow-xs'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full mb-2">
                                <ConnectorIcon engine={item.id} size="md" className="group-hover/card:scale-105 transition-transform" />
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                  {item.tag}
                                </span>
                              </div>
                              <span className="text-xs font-bold line-clamp-1 leading-snug group-hover/card:text-sky-600 dark:group-hover/card:text-sky-400 transition-colors">
                                {item.label}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center justify-between w-full font-mono">
                                <span>{item.defaultPort > 0 ? `Port :${item.defaultPort}` : 'Embedded'}</span>
                                <span className="text-sky-500 opacity-0 group-hover/card:opacity-100 transition-opacity font-bold font-sans">Select →</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* OPTION 2: IMPORT CONNECTION URL */}
                  {newConnMethod === 'url' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Link className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                              Paste Database Connection URL
                            </h4>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            URI / TablePlus / DBeaver / SSH
                          </span>
                        </div>

                        <div className="relative">
                          <textarea
                            rows={3}
                            value={urlInputValue}
                            onChange={(e) => setUrlInputValue(e.target.value)}
                            placeholder="postgresql://user:password@hostname.rds.amazonaws.com:5432/dbname?sslmode=require"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-slate-100 font-mono text-xs placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-2xs resize-none"
                          />
                          {urlInputValue && (
                            <button
                              type="button"
                              onClick={() => setUrlInputValue('')}
                              className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Quick Examples */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                            Examples:
                          </span>
                          {[
                            { label: 'Postgres Aurora', url: 'postgresql://postgres:secret123@commonprod-aurora-cluster.cluster-cmilpekm1tcx.us-east-2.rds.amazonaws.com:5432/commonproddb?sslmode=require' },
                            { label: 'Local Postgres', url: 'postgresql://postgres:postgres@localhost:5432/postgres' },
                            { label: 'MySQL 8', url: 'mysql://root:password@localhost:3306/production_db' },
                            { label: 'Redis Cache', url: 'redis://:authpass@localhost:6379/0' },
                            { label: 'SQLite', url: 'sqlite:///var/data/app.db' },
                          ].map((ex) => (
                            <button
                              key={ex.label}
                              type="button"
                              onClick={() => setUrlInputValue(ex.url)}
                              className="text-[10px] px-2 py-0.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-md text-slate-600 dark:text-slate-300 transition cursor-pointer"
                            >
                              {ex.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Live Parsed Preview Box */}
                      {parsedUrlResult ? (
                        <div className="p-4 bg-emerald-50/60 dark:bg-slate-900/90 border border-emerald-200 dark:border-emerald-500/40 rounded-2xl space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <ConnectorIcon engine={parsedUrlResult.engine} size="sm" />
                              <div>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  {CONNECTOR_METADATA[parsedUrlResult.engine]?.label || parsedUrlResult.engine} Detected
                                </span>
                                <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded font-mono font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  Valid URL
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleApplyUrlToForm}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-xs active:scale-95 cursor-pointer flex items-center space-x-1.5"
                            >
                              <span>Continue to Connection Info</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-500/20 text-[11px] font-mono">
                            <div className="p-2 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Host</span>
                              <span className="text-slate-800 dark:text-slate-200 truncate block font-bold" title={parsedUrlResult.host}>
                                {parsedUrlResult.host}
                              </span>
                            </div>
                            <div className="p-2 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Port</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold">
                                {parsedUrlResult.port}
                              </span>
                            </div>
                            <div className="p-2 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Database</span>
                              <span className="text-slate-800 dark:text-slate-200 truncate block font-bold">
                                {parsedUrlResult.database}
                              </span>
                            </div>
                            <div className="p-2 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">User</span>
                              <span className="text-slate-800 dark:text-slate-200 truncate block font-bold">
                                {parsedUrlResult.username || 'default'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : urlParseError ? (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/40 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                          <span>{urlParseError}</span>
                        </div>
                      ) : (
                        <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-1 text-slate-400">
                          <Link className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="text-xs font-semibold">Paste any connection URL above</p>
                          <p className="text-[10px]">DBNerd will automatically detect engine, credentials, ports, and environment</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OPTION 3: IMPORT FROM FILE / TOOLS */}
                  {newConnMethod === 'file' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      {/* Supported tools badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                          Supported Clients:
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-md font-mono">
                          TablePlus (*.tableplusconnection, .plist, .json)
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-md font-mono">
                          DBeaver (data-sources.json)
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md font-mono">
                          pgAdmin 4 (servers.json)
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md font-mono">
                          DBNerd JSON / Plist
                        </span>
                      </div>

                      {/* Drag & Drop Area */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".tableplusconnection,.json,.xml,.plist,.txt"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                      />

                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragOver(true);
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-8 border-2 border-dashed rounded-2xl text-center space-y-2 cursor-pointer transition-all ${
                          isDragOver
                            ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/30 scale-[1.01]'
                            : 'border-slate-300 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500/70 bg-slate-50/60 dark:bg-slate-900/40'
                        }`}
                      >
                        <UploadCloud className="w-8 h-8 mx-auto text-purple-600 dark:text-purple-400" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            Click to browse or drag & drop connection export file
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                            Drop a *.tableplusconnection, DBeaver data-sources.json, or pgAdmin servers.json file
                          </p>
                        </div>
                      </div>

                      {fileImportError && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/40 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                          <span>{fileImportError}</span>
                        </div>
                      )}

                      {/* Discovered Items List */}
                      {importedFileItems.length > 0 && (
                        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                Discovered {importedFileItems.length} Connection(s) in {importedFileName}
                              </span>
                            </div>

                            {importedFileItems.length > 1 && (
                              <button
                                type="button"
                                onClick={handleBatchImportAll}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition shadow-xs active:scale-95 cursor-pointer flex items-center space-x-1.5"
                              >
                                <span>Import All ({importedFileItems.length}) Connections</span>
                              </button>
                            )}
                          </div>

                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {importedFileItems.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/70 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between transition"
                              >
                                <div className="flex items-center space-x-2.5 truncate">
                                  <ConnectorIcon engine={item.engine} size="xs" />
                                  <div className="truncate">
                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                      {item.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono truncate">
                                      {item.username}@{item.host}:{item.port}/{item.database}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleApplyFileItemToForm(item)}
                                  className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] rounded-lg transition active:scale-95 cursor-pointer shrink-0 ml-2"
                                >
                                  Configure & Connect →
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ========================================================================= */
                /* STEP 2 / EDIT MODE: CONNECTION PARAMETERS & CREDENTIALS                   */
                /* ========================================================================= */
                <div className="space-y-4">
                  {isCreatingNew && (
                    <div className="flex items-center justify-between p-2.5 bg-slate-100 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl mb-3">
                      <div className="flex items-center space-x-2">
                        <ConnectorIcon engine={formData.engine} size="xs" />
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                          {CONNECTOR_METADATA[formData.engine]?.label || formData.engine}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {CONNECTOR_METADATA[formData.engine]?.tag}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCreationStep('select-engine')}
                        className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 font-semibold text-[11px] transition flex items-center space-x-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        <span>Change Connector / Method</span>
                      </button>
                    </div>
                  )}

                {/* Connection Name & Flexible Target Group Selection */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-7">
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                      Connection Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. prod-replica-db"
                      className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors shadow-2xs"
                    />
                  </div>

                  <div className="col-span-12 sm:col-span-5 relative" ref={groupDropdownRef}>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                      Target Group
                    </label>
                    
                    {/* Trigger Button: Shows selected group dot, name, tag */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsGroupDropdownOpen(!isGroupDropdownOpen);
                        setIsCreatingCustomGroup(false);
                      }}
                      className={`w-full h-9 bg-white dark:bg-slate-950 border rounded-lg px-2.5 flex items-center justify-between text-xs font-medium transition-colors shadow-2xs cursor-pointer select-none ${
                        isGroupDropdownOpen
                          ? 'border-sky-500 ring-1 ring-sky-500/20 text-slate-900 dark:text-white'
                          : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {(() => {
                          const grp = connectionGroups.find((g) => g.id === formData.groupId);
                          if (!grp || formData.groupId === 'ungrouped') {
                            return (
                              <>
                                <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-slate-500 dark:text-slate-400">None (Ungrouped)</span>
                              </>
                            );
                          }
                          const col = COLOR_MAP[grp.color] || COLOR_MAP.rose;
                          return (
                            <>
                              <span className={`w-2 h-2 rounded-full ${col.dot} shrink-0`} />
                              <span className="truncate">{grp.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 shrink-0">
                                {grp.tag}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                          isGroupDropdownOpen ? 'rotate-180 text-sky-500' : 'text-slate-400'
                        }`}
                      />
                    </button>

                    {/* Flexible Creatable Popover */}
                    {isGroupDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1.5 z-50 w-full min-w-[280px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl p-2 space-y-2 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/5 dark:ring-white/10 font-sans">
                        {/* Search or Quick-type input */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            ref={groupSearchInputRef}
                            type="text"
                            value={groupSearchQuery}
                            onChange={(e) => setGroupSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = groupSearchQuery.trim();
                                if (!trimmed) return;
                                const match = connectionGroups.find(
                                  (g) => g.name.toLowerCase() === trimmed.toLowerCase()
                                );
                                if (match) {
                                  handleSelectGroup(match.id);
                                } else {
                                  handleCreateGroupInline(trimmed);
                                }
                              } else if (e.key === 'Escape') {
                                setIsGroupDropdownOpen(false);
                              }
                            }}
                            placeholder="Filter or type new group..."
                            className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                          />
                        </div>

                        {/* Quick Create Button when query doesn't match an existing group */}
                        {(() => {
                          const query = groupSearchQuery.trim();
                          if (!query) return null;
                          const exact = connectionGroups.some(
                            (g) => g.name.toLowerCase() === query.toLowerCase()
                          );
                          if (exact) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => handleCreateGroupInline(query)}
                              className="w-full px-2.5 py-1.5 text-left flex items-center justify-between text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 rounded-lg transition active:scale-[0.99] cursor-pointer border border-sky-200/60 dark:border-sky-800/60"
                            >
                              <div className="flex items-center space-x-1.5 truncate">
                                <Plus className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Create "{query}"</span>
                              </div>
                              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-sky-200/70 dark:bg-sky-800/60 text-sky-800 dark:text-sky-200 shrink-0">
                                {query.slice(0, 4).toUpperCase()}
                              </span>
                            </button>
                          );
                        })()}

                        {/* Existing Groups List */}
                        <div className="max-h-44 overflow-y-auto space-y-0.5 pr-0.5">
                          {connectionGroups
                            .filter((g) => {
                              const q = groupSearchQuery.trim().toLowerCase();
                              return !q || g.name.toLowerCase().includes(q) || g.tag.toLowerCase().includes(q);
                            })
                            .map((grp) => {
                              const isSelected = formData.groupId === grp.id;
                              const col = COLOR_MAP[grp.color] || COLOR_MAP.rose;
                              const count = connections.filter((c) => c.groupId === grp.id).length;
                              return (
                                <button
                                  key={grp.id}
                                  type="button"
                                  onClick={() => handleSelectGroup(grp.id)}
                                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between text-xs rounded-lg transition cursor-pointer ${
                                    isSelected
                                      ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200 font-semibold border border-sky-200 dark:border-sky-800/60'
                                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                                  }`}
                                >
                                  <div className="flex items-center space-x-2 truncate">
                                    <span className={`w-2 h-2 rounded-full ${col.dot} shrink-0`} />
                                    <span className="truncate">{grp.name}</span>
                                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                                      {grp.tag}
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                      {count}
                                    </span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-sky-500" />}
                                  </div>
                                </button>
                              );
                            })}

                          {/* Ungrouped option */}
                          <button
                            type="button"
                            onClick={() => handleSelectGroup('ungrouped')}
                            className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between text-xs rounded-lg transition cursor-pointer ${
                              formData.groupId === 'ungrouped' || !formData.groupId
                                ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200 font-semibold border border-sky-200 dark:border-sky-800/60'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>None (Ungrouped)</span>
                            </div>
                            {(formData.groupId === 'ungrouped' || !formData.groupId) && (
                              <Check className="w-3.5 h-3.5 text-sky-500" />
                            )}
                          </button>
                        </div>

                        {/* Custom Group Creation Expandable Section */}
                        <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                          {!isCreatingCustomGroup ? (
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreatingCustomGroup(true);
                                setCustomGroupName(groupSearchQuery.trim());
                                setCustomGroupTag(groupSearchQuery.trim().slice(0, 4).toUpperCase() || 'DEV');
                              }}
                              className="w-full px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 flex items-center space-x-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Custom group with color & tag...</span>
                            </button>
                          ) : (
                            <div className="p-2 bg-slate-50 dark:bg-slate-950/80 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
                              <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] flex items-center justify-between">
                                <span>Create New Group</span>
                                <button
                                  type="button"
                                  onClick={() => setIsCreatingCustomGroup(false)}
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={customGroupName}
                                onChange={(e) => {
                                  setCustomGroupName(e.target.value);
                                  if (!customGroupTag || customGroupTag === 'DEV') {
                                    setCustomGroupTag(e.target.value.slice(0, 4).toUpperCase());
                                  }
                                }}
                                placeholder="Group name (e.g. Analytics DB)"
                                className="w-full h-7 px-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                              />
                              <div className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={customGroupTag}
                                  onChange={(e) => setCustomGroupTag(e.target.value.toUpperCase())}
                                  placeholder="Tag (e.g. QA)"
                                  maxLength={6}
                                  className="w-20 h-7 px-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 uppercase focus:outline-none focus:border-sky-500"
                                />
                                <div className="flex items-center space-x-1 flex-1 justify-end">
                                  {(['rose', 'amber', 'emerald', 'sky', 'purple'] as const).map((col) => (
                                    <button
                                      key={col}
                                      type="button"
                                      onClick={() => setCustomGroupColor(col)}
                                      className={`w-4 h-4 rounded-full ${COLOR_MAP[col]?.dot} transition-transform cursor-pointer ${
                                        customGroupColor === col ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-end space-x-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setIsCreatingCustomGroup(false)}
                                  className="px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCreateGroupInline(customGroupName, customGroupTag, customGroupColor)}
                                  disabled={!customGroupName.trim()}
                                  className="px-2.5 py-1 text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded transition shadow-xs"
                                >
                                  Create & Select
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Engine Banner: Shown in create mode to allow changing connector; in edit mode connector is shown in the header */}
                {isCreatingNew && (() => {
                  const meta = CONNECTOR_METADATA[formData.engine] || CONNECTOR_METADATA.generic;
                  return (
                    <div className="bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-500/30 rounded-xl p-3 flex items-center justify-between shadow-2xs">
                      <div className="flex items-center space-x-3">
                        <ConnectorIcon engine={formData.engine} size="md" />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                              {meta.label}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-white/80 dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
                              {meta.tag} • {getCategoryLabel(meta.category)}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Step 2 of 2 • Fill in credentials and endpoint configuration
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCreationStep('select-engine')}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-400 transition flex items-center space-x-1.5 shadow-2xs active:scale-95 cursor-pointer"
                        title="Choose a different database driver"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Change Connector</span>
                      </button>
                    </div>
                  );
                })()}

            {/* Host & Port (Postgres, MySQL, Redis) */}
            {formData.engine !== 'snowflake' && (
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-9">
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                    Host / Server Address
                  </label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    placeholder="localhost or db.cloud.internal"
                    className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors shadow-2xs"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                    Port
                  </label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value, 10) || 5432 })}
                    className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors shadow-2xs"
                  />
                </div>
              </div>
            )}

            {/* Database / Keyspace Name */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                {formData.engine === 'redis' ? 'Database Index (0-15)' : 'Database / Schema'}
              </label>
              <input
                type="text"
                value={formData.database}
                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                placeholder={formData.engine === 'redis' ? '0' : 'ecom_prod_db'}
                className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors shadow-2xs"
              />
            </div>

            {/* Snowflake Specific Fields */}
            {formData.engine === 'snowflake' && (
              <div className="space-y-3 bg-sky-50/70 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-500/30 p-3 rounded-xl animate-in fade-in duration-200 shadow-2xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                      Account Identifier
                    </label>
                    <input
                      type="text"
                      value={formData.accountIdentifier || ''}
                      onChange={(e) => setFormData({ ...formData, accountIdentifier: e.target.value })}
                      placeholder="e.g. xy12345.us-east-1"
                      className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                      Warehouse
                    </label>
                    <input
                      type="text"
                      value={formData.warehouse || ''}
                      onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                      placeholder="e.g. COMPUTE_WH"
                      className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* User & Password */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                  Username / Role
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="app_master"
                  className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors shadow-2xs"
                />
              </div>
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full h-9 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors shadow-2xs"
                />
              </div>
            </div>

            {/* TablePlus Safety Level Selector */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 text-slate-800 dark:text-slate-200 font-semibold select-none text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                  <span>Safety Mode / Protection Level</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">TablePlus Standard</span>
              </div>
              <div className="relative">
                <select
                  value={formData.safeMode || (formData.env === 'prod' ? 'alert-2' : 'silent')}
                  onChange={(e) => setFormData({ ...formData, safeMode: e.target.value as any })}
                  className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-3 pr-8 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 shadow-2xs font-sans appearance-none cursor-pointer"
                >
                  <option value="silent">🔓 Silent Mode — Send queries without warnings</option>
                  <option value="alert-1">🟡 Alert Mode 1 — Warn before sending queries</option>
                  <option value="alert-2">⭕ Alert Mode 2 — Warn except SELECT/EXPLAIN/SHOW</option>
                  <option value="safe-1">🔴 Safe Mode 1 — Prompt password before sending queries</option>
                  <option value="safe-2">⭕ Safe Mode 2 — Prompt password except SELECT/EXPLAIN/SHOW</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* TablePlus-grade SSH Bastion Tunnel (Zero-Trust Jump Host) Option */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 text-slate-800 dark:text-slate-200 cursor-pointer font-semibold select-none text-xs">
                  <input
                    type="checkbox"
                    checked={formData.useSsh || false}
                    onChange={(e) => setFormData({ ...formData, useSsh: e.target.checked })}
                    className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-500 focus:ring-sky-500"
                  />
                  <Shield className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Connect via SSH Bastion Tunnel (Zero-Trust)</span>
                </label>
                {formData.useSsh && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-medium">
                    Over SSH
                  </span>
                )}
              </div>

              {formData.useSsh && (
                <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800 animate-in fade-in duration-150">
                  {/* Row 1: SSH Server Host & Port */}
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-9">
                      <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                        Server (SSH Host)
                      </label>
                      <input
                        type="text"
                        value={formData.sshHost || ''}
                        onChange={(e) => setFormData({ ...formData, sshHost: e.target.value })}
                        placeholder="13.212.189.147"
                        className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-slate-800 dark:text-slate-200 font-mono text-xs shadow-2xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                        Port
                      </label>
                      <input
                        type="number"
                        value={formData.sshPort ?? 22}
                        onChange={(e) => setFormData({ ...formData, sshPort: parseInt(e.target.value, 10) || 22 })}
                        placeholder="22"
                        className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-slate-800 dark:text-slate-200 font-mono text-xs shadow-2xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>

                  {/* Row 2: SSH User & SSH Password */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                        SSH User
                      </label>
                      <input
                        type="text"
                        value={formData.sshUser || ''}
                        onChange={(e) => setFormData({ ...formData, sshUser: e.target.value })}
                        placeholder="ec2-user"
                        className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-slate-800 dark:text-slate-200 font-mono text-xs shadow-2xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                          SSH Password
                        </label>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">Store in keychain</span>
                      </div>
                      <div className="relative">
                        <input
                          type={showSshPassword ? 'text' : 'password'}
                          value={formData.sshPassword || ''}
                          onChange={(e) => setFormData({ ...formData, sshPassword: e.target.value })}
                          placeholder="password"
                          className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-3 pr-8 text-slate-800 dark:text-slate-200 font-mono text-xs shadow-2xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSshPassword(!showSshPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                        >
                          {showSshPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Use SSH Key (RSA / Ed25519) */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer font-medium text-xs select-none">
                        <input
                          type="checkbox"
                          checked={formData.useSshKey ?? true}
                          onChange={(e) => setFormData({ ...formData, useSshKey: e.target.checked })}
                          className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-500 focus:ring-sky-500"
                        />
                        <Key className="w-3.5 h-3.5 text-amber-500" />
                        <span>Use SSH key</span>
                      </label>

                      {/* Quick preset chips */}
                      {formData.useSshKey && (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, sshKeyPath: '~/.ssh/vigo/id_rsa' })}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 hover:text-sky-500 transition-colors cursor-pointer"
                          >
                            vigo/id_rsa
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, sshKeyPath: 'id_rsa' })}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-sky-500 transition-colors cursor-pointer"
                          >
                            id_rsa
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, sshKeyPath: 'id_ed25519' })}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-sky-500 transition-colors cursor-pointer"
                          >
                            id_ed25519
                          </button>
                        </div>
                      )}
                    </div>

                    {formData.useSshKey && (
                      <div className="space-y-2 pl-5">
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setFormData({ ...formData, sshKeyPath: file.name });
                              }
                            }}
                          />
                          <input
                            type="text"
                            value={formData.sshKeyPath || ''}
                            onChange={(e) => setFormData({ ...formData, sshKeyPath: e.target.value })}
                            placeholder="id_rsa"
                            className="flex-1 h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-slate-800 dark:text-slate-200 font-mono text-xs shadow-2xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            title="Browse private key file"
                            className="h-9 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors shrink-0 flex items-center space-x-1 cursor-pointer"
                          >
                            <FileKey className="w-3.5 h-3.5 text-slate-500" />
                            <span>Browse…</span>
                          </button>
                        </div>

                        {/* Optional Passphrase */}
                        <div>
                          <input
                            type="password"
                            value={formData.sshPassphrase || ''}
                            onChange={(e) => setFormData({ ...formData, sshPassphrase: e.target.value })}
                            placeholder="Passphrase (optional)"
                            className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-slate-800 dark:text-slate-200 font-mono text-xs shadow-2xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                          />
                        </div>

                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-relaxed">
                          DBNerd will use <span className="text-slate-600 dark:text-slate-300 font-semibold">~/.ssh/config</span> if you leave private key empty
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

    </div>

  </div>

        {/* Footer Actions with smooth heartbeat test feedback */}
        <div className="h-14 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-5 flex items-center justify-between select-none">
          {isCreatingNew && creationStep === 'select-engine' ? (
            <>
              <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Selected Engine:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <ConnectorIcon engine={formData.engine} size="xs" />
                  <span>{CONNECTOR_METADATA[formData.engine]?.label || formData.engine}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({getCategoryLabel(CONNECTOR_METADATA[formData.engine]?.category)})
                  </span>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    if (connections.length > 0) {
                      setIsCreatingNew(false);
                      setSelectedConnId(connections[0].id);
                    } else {
                      setConnectionModalOpen(false);
                    }
                  }}
                  className="px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setCreationStep('configure')}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition shadow-xs active:scale-95 cursor-pointer flex items-center space-x-1.5"
                >
                  <span>Next: Connection Info</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center space-x-2">
                {isCreatingNew && (
                  <button
                    type="button"
                    onClick={() => setCreationStep('select-engine')}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center space-x-1.5 active:scale-95 cursor-pointer mr-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Methods</span>
                  </button>
                )}

                <button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="relative overflow-hidden px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed border border-slate-300 dark:border-transparent"
                >
                  {isTesting && (
                    <BorderChase color="sky" dual={true} speed="fast" borderWidth={1.5} glow={true} />
                  )}
                  <span className="relative z-1">{isTesting ? 'Pinging host...' : 'Test Connection'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const currentProfile: ConnectionProfile = {
                      ...formData,
                      id: selectedConnId || 'temp',
                    };
                    const url = serializeConnectionUrl(currentProfile);
                    navigator.clipboard.writeText(url);
                    showToast('📋 Copied Connection URL');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-xl transition active:scale-95 cursor-pointer flex items-center space-x-1.5 border border-slate-300 dark:border-transparent"
                  title="Copy connection as TablePlus / standard URL"
                >
                  <Link className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Copy as URL</span>
                </button>

                {testSuccess && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1.5 animate-in fade-in duration-200">
                    <HeartbeatDot color="green" size="xs" showWave={true} />
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Connected in {testLatency}ms (TLSv1.3 Handshake OK)</span>
                  </span>
                )}

                {testError && (
                  <span className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center space-x-1.5 animate-in fade-in duration-200 max-w-sm truncate" title={testError}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span className="truncate">{testError}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setConnectionModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOnly}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-300 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndConnect}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition shadow-xs active:scale-95 cursor-pointer"
                >
                  Save & Connect
                </button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Connection Profile Context Menu */}
      {connContextPos && targetConn && (
        <ContextMenuContainer position={connContextPos} onClose={() => setConnContextPos(null)}>
          <ContextMenuHeader title={`Connection: ${targetConn.name}`} />
          <ContextMenuItem
            icon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
            label={`Connect to "${targetConn.name}"`}
            onClick={() => {
              switchActiveConnection(targetConn.id);
              setConnectionModalOpen(false);
              showToast(`Connected to ${targetConn.name}`);
            }}
          />
          <ContextMenuItem
            icon={<Pencil className="w-3.5 h-3.5 text-sky-400" />}
            label="Edit Connection Profile"
            onClick={() => {
              handleSelectConnection(targetConn);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-300" />}
            label="Duplicate Connection"
            onClick={() => {
              const { id: _, ...rest } = targetConn;
              addConnection({
                ...rest,
                name: `${targetConn.name} (Copy)`,
                active: false,
              });
              showToast(`Duplicated "${targetConn.name}"`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Link className="w-3.5 h-3.5 text-amber-300" />}
            label="Copy as URL (TablePlus format)"
            onClick={() => {
              const url = serializeConnectionUrl(targetConn);
              navigator.clipboard.writeText(url);
              showToast(`Copied URL for "${targetConn.name}"`);
            }}
          />
          <ContextMenuItem
            icon={<FileCode className="w-3.5 h-3.5 text-slate-300" />}
            label="Copy Connection URI"
            onClick={() => {
              const uri = `${targetConn.engine}://${targetConn.username || 'user'}:••••@${targetConn.host || 'localhost'}:${targetConn.port}/${targetConn.database || ''}`;
              navigator.clipboard.writeText(uri);
              showToast(`Copied URI for "${targetConn.name}"`);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-300" />}
            label="Copy Config JSON"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(targetConn, null, 2));
              showToast(`Copied JSON config for "${targetConn.name}"`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
            label="Delete Connection"
            danger
            onClick={() => {
              setDeleteConfirmTarget({
                type: 'connection',
                id: targetConn.id,
                name: targetConn.name,
              });
            }}
          />
        </ContextMenuContainer>
      )}

      {/* Group Context Menu */}
      {groupContextPos && targetGroup && (
        <ContextMenuContainer position={groupContextPos} onClose={() => setGroupContextPos(null)}>
          <ContextMenuHeader title={`Group: ${targetGroup.name} (${targetGroup.tag})`} />
          <ContextMenuItem
            icon={<Plus className="w-3.5 h-3.5 text-emerald-400" />}
            label={`New Connection in "${targetGroup.name}"`}
            onClick={() => {
              handleStartNewConnection(targetGroup.id);
              setCollapsedGroups((prev) => ({ ...prev, [targetGroup.id]: false }));
            }}
          />
          <ContextMenuItem
            icon={<FolderOpen className="w-3.5 h-3.5 text-sky-400" />}
            label={collapsedGroups[targetGroup.id] ? 'Expand Group' : 'Collapse Group'}
            onClick={() => {
              toggleGroupCollapse(targetGroup.id);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-300" />}
            label="Copy Group Name"
            onClick={() => {
              navigator.clipboard.writeText(targetGroup.name);
              showToast(`Copied "${targetGroup.name}"`);
            }}
          />
          <ContextMenuDivider />
          {connectionGroups.length > 1 && (
            <ContextMenuItem
              icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
              label="Delete Group"
              danger
              onClick={() => {
                const count = connections.filter((c) => c.groupId === targetGroup.id).length;
                setDeleteConfirmTarget({
                  type: 'group',
                  id: targetGroup.id,
                  name: targetGroup.name,
                  count,
                });
              }}
            />
          )}
        </ContextMenuContainer>
      )}

      {/* In-App Native Delete Confirmation Modal (Reliable across Web and Tauri WKWebView) */}
      {deleteConfirmTarget && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setDeleteConfirmTarget(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100 ring-1 ring-black/5 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400 shadow-2xs">
                <Trash2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {deleteConfirmTarget.type === 'connection' ? 'Delete Connection' : 'Delete Group'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {deleteConfirmTarget.type === 'connection' ? (
                    <>
                      Are you sure you want to delete <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">"{deleteConfirmTarget.name}"</span>? This configuration cannot be recovered.
                    </>
                  ) : deleteConfirmTarget.count && deleteConfirmTarget.count > 0 ? (
                    <>
                      Group <span className="font-semibold text-slate-800 dark:text-slate-200">"{deleteConfirmTarget.name}"</span> contains <span className="font-bold text-rose-500">{deleteConfirmTarget.count}</span> connection(s). Deleting this group will permanently remove all associated connections.
                    </>
                  ) : (
                    <>
                      Are you sure you want to delete empty group <span className="font-semibold text-slate-800 dark:text-slate-200">"{deleteConfirmTarget.name}"</span>?
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer active:scale-95"
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                autoFocus
                onClick={handleExecuteDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center space-x-1.5 active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete (↵)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
