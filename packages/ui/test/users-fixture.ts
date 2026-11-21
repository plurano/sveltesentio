// Rows and columns for the headless DataTable model and rune-store tests,
// shared by `data-model.test.ts` and `data-store.test.ts`.
import type { ColumnDef } from '../src/data/model.js';

export interface User {
	readonly id: number;
	readonly name: string;
	readonly role: string;
	readonly active: boolean;
}

export const users: readonly User[] = [
	{ id: 1, name: 'Charlie', role: 'admin', active: true },
	{ id: 2, name: 'alice', role: 'user', active: false },
	{ id: 3, name: 'Bob', role: 'user', active: true },
	{ id: 4, name: 'Dave', role: 'editor', active: false },
];

export const userColumns: readonly ColumnDef<User>[] = [
	{ id: 'name', header: 'Name', accessor: (u) => u.name },
	{ id: 'role', header: 'Role', accessor: (u) => u.role },
	{ id: 'id', header: 'ID', accessor: (u) => u.id },
	{
		id: 'active',
		header: 'Active',
		accessor: (u) => u.active,
		filterable: false,
		sortable: false,
	},
];
