import type { StudyDocument } from '../../types';
export type LibraryKind = 'all' | 'readings' | 'collections';
export type LibraryLocation = { folderId: string; kind: LibraryKind };
export const DEFAULT_LIBRARY_LOCATION: LibraryLocation = { folderId: '__all__', kind: 'all' };
export const isCollection = (doc: StudyDocument) => Boolean(doc.analysis.collection || doc.source_type === 'vocabulary_collection');
export const matchesLibraryKind = (doc: StudyDocument, kind: LibraryKind) => kind === 'all' || (kind === 'collections' ? isCollection(doc) : !isCollection(doc));
