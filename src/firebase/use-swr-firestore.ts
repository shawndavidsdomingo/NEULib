
'use client';

import useSWR from 'swr';
import { 
  getDocs, 
  query, 
  collection, 
  Firestore, 
  Query, 
  DocumentData,
  QueryConstraint
} from 'firebase/firestore';

/**
 * Generic fetcher for Firestore collections to be used with SWR.
 */
const firestoreCollectionFetcher = async (queryInstance: Query<DocumentData>) => {
  const snapshot = await getDocs(queryInstance);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id
  }));
};

/**
 * Hook to use SWR with Firestore queries.
 * @param queryKey A unique string key for the query (e.g., the collection path)
 * @param queryInstance The Firestore Query object
 */
export function useFirestoreSWR<T = any>(
  queryKey: string | null,
  queryInstance: Query<DocumentData> | null
) {
  const { data, error, mutate } = useSWR(
    queryKey,
    () => queryInstance ? firestoreCollectionFetcher(queryInstance) : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute cache
    }
  );

  return {
    data: (data as T[]) || null,
    isLoading: !error && !data && !!queryKey,
    isError: error,
    mutate
  };
}
