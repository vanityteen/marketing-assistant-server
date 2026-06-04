import mysql from 'mysql2/promise';
declare const pool: mysql.Pool;
export type DBRow = Record<string, unknown>;
export type DBResult = mysql.ResultSetHeader;
declare const db: {
    get: (sql: string, ...params: unknown[]) => Promise<DBRow>;
    all: (sql: string, ...params: unknown[]) => Promise<DBRow[]>;
    run: (sql: string, ...params: unknown[]) => Promise<mysql.ResultSetHeader>;
};
export { pool };
export default db;
//# sourceMappingURL=db.d.ts.map