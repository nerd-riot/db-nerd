import React from 'react';
import { Tooltip } from './Tooltip';
import {
  Hash,
  Type,
  Calendar,
  Clock,
  Braces,
  ToggleLeft,
  KeyRound,
  Binary,
  MapPin,
  List,
} from 'lucide-react';

export type ColumnCategory =
  | 'number'
  | 'text'
  | 'date'
  | 'datetime'
  | 'time'
  | 'json'
  | 'boolean'
  | 'uuid'
  | 'binary'
  | 'geo'
  | 'array'
  | 'unknown';

export function resolveColumnTypeCategory(
  typeStr?: string,
  sampleValue?: any
): { category: ColumnCategory; label: string } {
  if (typeStr) {
    const t = typeStr.toLowerCase().trim();

    // Arrays
    if (t.endsWith('[]') || t.startsWith('_') || t.includes('array')) {
      return { category: 'array', label: typeStr };
    }

    // Number / Integer / Numeric / Decimal / Float / Serial
    if (
      t.includes('int') ||
      t.includes('numeric') ||
      t.includes('decimal') ||
      t.includes('float') ||
      t.includes('double') ||
      t.includes('real') ||
      t.includes('serial') ||
      t.includes('number') ||
      t.includes('money')
    ) {
      return { category: 'number', label: typeStr };
    }

    // Datetime / Timestamp / Interval
    if (
      t.includes('timestamp') ||
      t.includes('timestamptz') ||
      t.includes('datetime') ||
      t.includes('interval')
    ) {
      return { category: 'datetime', label: typeStr };
    }

    // Date
    if (t.includes('date')) {
      return { category: 'date', label: typeStr };
    }

    // Time
    if (t.includes('time')) {
      return { category: 'time', label: typeStr };
    }

    // JSON / JSONB
    if (t.includes('json') || t.includes('jsonb')) {
      return { category: 'json', label: typeStr };
    }

    // Boolean
    if (t.includes('bool')) {
      return { category: 'boolean', label: typeStr };
    }

    // UUID / ULID
    if (t.includes('uuid') || t.includes('ulid') || t.includes('guid')) {
      return { category: 'uuid', label: typeStr };
    }

    // Binary / Bytea / Blob
    if (t.includes('bytea') || t.includes('blob') || t.includes('binary') || t.includes('bit')) {
      return { category: 'binary', label: typeStr };
    }

    // Geographic / Spatial
    if (
      t.includes('geo') ||
      t.includes('point') ||
      t.includes('polygon') ||
      t.includes('coord')
    ) {
      return { category: 'geo', label: typeStr };
    }

    // Text / Varchar / Char / Citext / String
    if (
      t.includes('char') ||
      t.includes('text') ||
      t.includes('varchar') ||
      t.includes('string') ||
      t.includes('citext')
    ) {
      return { category: 'text', label: typeStr };
    }
  }

  // Fallback: Infer from sample value if typeStr is missing
  if (sampleValue !== null && sampleValue !== undefined) {
    if (typeof sampleValue === 'number') {
      return { category: 'number', label: 'numeric' };
    }
    if (typeof sampleValue === 'boolean') {
      return { category: 'boolean', label: 'boolean' };
    }
    if (Array.isArray(sampleValue)) {
      return { category: 'array', label: 'array' };
    }
    if (typeof sampleValue === 'object') {
      return { category: 'json', label: 'json' };
    }
    if (typeof sampleValue === 'string') {
      // ISO timestamp e.g. 2026-10-21 14:30:00 or 2026-10-21T14:30:00
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(sampleValue)) {
        return { category: 'datetime', label: 'timestamp' };
      }
      // Date e.g. 2026-10-21
      if (/^\d{4}-\d{2}-\d{2}$/.test(sampleValue)) {
        return { category: 'date', label: 'date' };
      }
      // Time e.g. 14:30:00
      if (/^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(sampleValue)) {
        return { category: 'time', label: 'time' };
      }
      // UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sampleValue)) {
        return { category: 'uuid', label: 'uuid' };
      }
      return { category: 'text', label: 'text' };
    }
  }

  return { category: 'text', label: typeStr || 'text' };
}

interface ColumnTypeIconProps {
  type?: string;
  sampleValue?: any;
  className?: string;
  size?: number;
}

export const ColumnTypeIcon: React.FC<ColumnTypeIconProps> = ({
  type,
  sampleValue,
  className = '',
  size = 12,
}) => {
  const { category, label } = resolveColumnTypeCategory(type, sampleValue);

  const renderIcon = () => {
    switch (category) {
      case 'number':
        return <Hash size={size} className={`text-amber-500 dark:text-amber-400 flex-shrink-0 ${className}`} />;
      case 'date':
        return <Calendar size={size} className={`text-emerald-600 dark:text-emerald-400 flex-shrink-0 ${className}`} />;
      case 'datetime':
      case 'time':
        return <Clock size={size} className={`text-emerald-600 dark:text-emerald-400 flex-shrink-0 ${className}`} />;
      case 'json':
        return <Braces size={size} className={`text-purple-600 dark:text-purple-400 flex-shrink-0 ${className}`} />;
      case 'boolean':
        return <ToggleLeft size={size} className={`text-rose-500 dark:text-rose-400 flex-shrink-0 ${className}`} />;
      case 'uuid':
        return <KeyRound size={size} className={`text-indigo-500 dark:text-indigo-400 flex-shrink-0 ${className}`} />;
      case 'binary':
        return <Binary size={size} className={`text-slate-500 dark:text-slate-400 flex-shrink-0 ${className}`} />;
      case 'geo':
        return <MapPin size={size} className={`text-teal-600 dark:text-teal-400 flex-shrink-0 ${className}`} />;
      case 'array':
        return <List size={size} className={`text-blue-600 dark:text-cyan-400 flex-shrink-0 ${className}`} />;
      case 'text':
      default:
        return <Type size={size} className={`text-sky-600 dark:text-sky-400 flex-shrink-0 ${className}`} />;
    }
  };

  return (
    <Tooltip side="top" content={`Type: ${label}`}>
      <span className="inline-flex items-center flex-shrink-0 cursor-help">
        {renderIcon()}
      </span>
    </Tooltip>
  );
};
