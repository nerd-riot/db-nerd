import React from 'react';
import { Tooltip } from './Tooltip';

export interface ConnectorIconProps {
  engine: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  alt?: string;
}

export interface ConnectorMetadata {
  id: string;
  label: string;
  iconSrc: string;
  tag: string;
  defaultPort: number;
  category: 'sql' | 'nosql' | 'cloud' | 'embedded';
}

export const CONNECTOR_METADATA: Record<string, ConnectorMetadata> = {
  postgres: { id: 'postgres', label: 'PostgreSQL', iconSrc: '/connectors/postgres.png', tag: 'Pg', defaultPort: 5432, category: 'sql' },
  postgresql: { id: 'postgres', label: 'PostgreSQL', iconSrc: '/connectors/postgres.png', tag: 'Pg', defaultPort: 5432, category: 'sql' },
  mysql: { id: 'mysql', label: 'MySQL', iconSrc: '/connectors/mysql.png', tag: 'Ms', defaultPort: 3306, category: 'sql' },
  redis: { id: 'redis', label: 'Redis', iconSrc: '/connectors/redis.png', tag: 'Re', defaultPort: 6379, category: 'nosql' },
  snowflake: { id: 'snowflake', label: 'Snowflake', iconSrc: '/connectors/snowflake.png', tag: 'Nf', defaultPort: 443, category: 'cloud' },
  sqlite: { id: 'sqlite', label: 'SQLite', iconSrc: '/connectors/sqlite.png', tag: 'Sl', defaultPort: 0, category: 'embedded' },
  mongodb: { id: 'mongodb', label: 'MongoDB', iconSrc: '/connectors/mongodb.png', tag: 'Mg', defaultPort: 27017, category: 'nosql' },
  duckdb: { id: 'duckdb', label: 'DuckDB', iconSrc: '/connectors/duckdb.png', tag: 'Du', defaultPort: 0, category: 'embedded' },
  clickhouse: { id: 'clickhouse', label: 'ClickHouse', iconSrc: '/connectors/clickhouse.png', tag: 'Ch', defaultPort: 8123, category: 'sql' },
  sqlserver: { id: 'sqlserver', label: 'Microsoft SQL Server', iconSrc: '/connectors/sqlserver.png', tag: 'Ss', defaultPort: 1433, category: 'sql' },
  mssql: { id: 'sqlserver', label: 'Microsoft SQL Server', iconSrc: '/connectors/sqlserver.png', tag: 'Ss', defaultPort: 1433, category: 'sql' },
  redshift: { id: 'redshift', label: 'Amazon Redshift', iconSrc: '/connectors/redshift.svg', tag: 'Rs', defaultPort: 5439, category: 'cloud' },
  mariadb: { id: 'mariadb', label: 'MariaDB & SingleStore', iconSrc: '/connectors/mariadb.svg', tag: 'Ma', defaultPort: 3306, category: 'sql' },
  cassandra: { id: 'cassandra', label: 'Cassandra', iconSrc: '/connectors/cassandra.svg', tag: 'Cs', defaultPort: 9042, category: 'nosql' },
  bigquery: { id: 'bigquery', label: 'BigQuery', iconSrc: '/connectors/bigquery.svg', tag: 'Bq', defaultPort: 443, category: 'cloud' },
  dynamodb: { id: 'dynamodb', label: 'DynamoDB (Beta)', iconSrc: '/connectors/dynamodb.svg', tag: 'Dn', defaultPort: 8000, category: 'nosql' },
  elasticsearch: { id: 'elasticsearch', label: 'Elasticsearch', iconSrc: '/connectors/elasticsearch.svg', tag: 'Es', defaultPort: 9200, category: 'nosql' },
  libsql: { id: 'libsql', label: 'LibSQL', iconSrc: '/connectors/libsql.svg', tag: 'Ls', defaultPort: 8080, category: 'embedded' },
  cloudflare_d1: { id: 'cloudflare_d1', label: 'Cloudflare D1', iconSrc: '/connectors/cloudflare_d1.svg', tag: 'D1', defaultPort: 8787, category: 'cloud' },
  oracle: { id: 'oracle', label: 'Oracle', iconSrc: '/connectors/oracle.svg', tag: 'Oc', defaultPort: 1521, category: 'sql' },
  cockroach: { id: 'cockroach', label: 'CockroachDB', iconSrc: '/connectors/cockroach.svg', tag: 'Cr', defaultPort: 26257, category: 'sql' },
  greenplum: { id: 'greenplum', label: 'Greenplum', iconSrc: '/connectors/greenplum.svg', tag: 'Gp', defaultPort: 5432, category: 'sql' },
  vertica: { id: 'vertica', label: 'Vertica', iconSrc: '/connectors/vertica.svg', tag: 'Ve', defaultPort: 5433, category: 'sql' },
  generic: { id: 'generic', label: 'Generic Database', iconSrc: '/connectors/generic.png', tag: 'Db', defaultPort: 5432, category: 'sql' },
};

/**
 * Full List of TablePlus-style connectors in display order
 */
export const ALL_TABLEPLUS_CONNECTORS: ConnectorMetadata[] = [
  CONNECTOR_METADATA.postgres,
  CONNECTOR_METADATA.redshift,
  CONNECTOR_METADATA.mysql,
  CONNECTOR_METADATA.mariadb,
  CONNECTOR_METADATA.sqlserver,
  CONNECTOR_METADATA.cassandra,
  CONNECTOR_METADATA.clickhouse,
  CONNECTOR_METADATA.bigquery,
  CONNECTOR_METADATA.dynamodb,
  CONNECTOR_METADATA.elasticsearch,
  CONNECTOR_METADATA.libsql,
  CONNECTOR_METADATA.cloudflare_d1,
  CONNECTOR_METADATA.mongodb,
  CONNECTOR_METADATA.snowflake,
  CONNECTOR_METADATA.redis,
  CONNECTOR_METADATA.sqlite,
  CONNECTOR_METADATA.duckdb,
  CONNECTOR_METADATA.oracle,
  CONNECTOR_METADATA.cockroach,
  CONNECTOR_METADATA.greenplum,
  CONNECTOR_METADATA.vertica,
  CONNECTOR_METADATA.generic,
];

const ENGINE_COLORS: Record<string, { bg: string; text: string }> = {
  postgres: { bg: 'bg-sky-600 dark:bg-sky-700', text: 'text-white' },
  postgresql: { bg: 'bg-sky-600 dark:bg-sky-700', text: 'text-white' },
  mysql: { bg: 'bg-amber-600 dark:bg-amber-700', text: 'text-white' },
  redis: { bg: 'bg-rose-600 dark:bg-rose-700', text: 'text-white' },
  snowflake: { bg: 'bg-cyan-600 dark:bg-cyan-700', text: 'text-white' },
  sqlite: { bg: 'bg-blue-600 dark:bg-blue-700', text: 'text-white' },
  mongodb: { bg: 'bg-emerald-600 dark:bg-emerald-700', text: 'text-white' },
  duckdb: { bg: 'bg-yellow-500 dark:bg-yellow-600', text: 'text-slate-900' },
  clickhouse: { bg: 'bg-orange-500 dark:bg-orange-600', text: 'text-white' },
  sqlserver: { bg: 'bg-red-600 dark:bg-red-700', text: 'text-white' },
  mssql: { bg: 'bg-red-600 dark:bg-red-700', text: 'text-white' },
  redshift: { bg: 'bg-red-700 dark:bg-red-800', text: 'text-white' },
  mariadb: { bg: 'bg-sky-700 dark:bg-sky-800', text: 'text-white' },
  cassandra: { bg: 'bg-teal-600 dark:bg-teal-700', text: 'text-white' },
  bigquery: { bg: 'bg-blue-500 dark:bg-blue-600', text: 'text-white' },
  dynamodb: { bg: 'bg-indigo-600 dark:bg-indigo-700', text: 'text-white' },
  elasticsearch: { bg: 'bg-yellow-600 dark:bg-yellow-700', text: 'text-white' },
  libsql: { bg: 'bg-cyan-500 dark:bg-cyan-600', text: 'text-slate-900' },
  cloudflare_d1: { bg: 'bg-amber-500 dark:bg-amber-600', text: 'text-white' },
  oracle: { bg: 'bg-red-600 dark:bg-red-700', text: 'text-white' },
  cockroach: { bg: 'bg-emerald-600 dark:bg-emerald-700', text: 'text-white' },
  greenplum: { bg: 'bg-green-700 dark:bg-green-800', text: 'text-white' },
  vertica: { bg: 'bg-indigo-700 dark:bg-indigo-800', text: 'text-white' },
  generic: { bg: 'bg-slate-600 dark:bg-slate-700', text: 'text-white' },
};

export const ConnectorIcon: React.FC<ConnectorIconProps> = ({
  engine,
  size = 'md',
  className = '',
  alt,
}) => {
  const normalized = (engine || 'generic').toLowerCase();
  const meta = CONNECTOR_METADATA[normalized] || CONNECTOR_METADATA.generic;
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [meta.iconSrc]);

  const sizeClasses = {
    xs: 'w-3.5 h-3.5 rounded',
    sm: 'w-5 h-5 rounded-md',
    md: 'w-7 h-7 rounded-lg',
    lg: 'w-9 h-9 rounded-xl',
    xl: 'w-12 h-12 rounded-2xl',
  }[size];

  const fontSizes = {
    xs: 'text-[7px]',
    sm: 'text-[9px]',
    md: 'text-[11px]',
    lg: 'text-xs',
    xl: 'text-sm',
  }[size];

  if (hasError) {
    const color = ENGINE_COLORS[normalized] || ENGINE_COLORS.generic;
    return (
      <Tooltip side="top" content={alt || meta.label}>
        <div
          className={`relative flex items-center justify-center shrink-0 select-none shadow-sm font-mono font-bold ${color.bg} ${color.text} ${sizeClasses} ${className}`}
        >
          <span className={`${fontSizes} uppercase tracking-tighter`}>
            {meta.tag || normalized.slice(0, 2)}
          </span>
        </div>
      </Tooltip>
    );
  }

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${sizeClasses} ${className}`}>
      <img
        src={meta.iconSrc}
        alt={alt || meta.label}
        className="w-full h-full object-contain rounded-[inherit] select-none pointer-events-none drop-shadow-sm"
        onError={() => setHasError(true)}
      />
    </div>
  );
};
