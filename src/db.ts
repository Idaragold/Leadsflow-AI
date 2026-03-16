import { 
  db, 
  handleFirestoreError, 
  OperationType, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  onSnapshot 
} from './firebase';
import { User, Business, Lead, Campaign } from './types';

export const firebaseDb = {
  // User
  getUser: async (userId: string): Promise<User | null> => {
    const path = `users/${userId}`;
    try {
      const docSnap = await getDoc(doc(db, 'users', userId));
      return docSnap.exists() ? (docSnap.data() as User) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },
  saveUser: async (user: User) => {
    const path = `users/${user.id}`;
    try {
      await setDoc(doc(db, 'users', user.id), user);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },
  updateUserPlan: async (userId: string, plan: User['plan']) => {
    const path = `users/${userId}`;
    try {
      await updateDoc(doc(db, 'users', userId), { plan, paymentStatus: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  // Business
  getBusinesses: async (userId: string): Promise<Business[]> => {
    const path = 'businesses';
    try {
      const q = query(collection(db, 'businesses'), where('ownerId', '==', userId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => doc.data() as Business);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },
  saveBusiness: async (business: Business) => {
    const path = `businesses/${business.id}`;
    try {
      await setDoc(doc(db, 'businesses', business.id), business);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  // Leads
  subscribeLeads: (userId: string, businessId: string | null, callback: (leads: Lead[]) => void) => {
    const path = 'leads';
    let q = query(collection(db, 'leads'), where('ownerId', '==', userId));
    if (businessId) {
      q = query(collection(db, 'leads'), where('ownerId', '==', userId), where('businessId', '==', businessId));
    }
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => doc.data() as Lead));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  },
  saveLeads: async (newLeads: Lead[]) => {
    const path = 'leads';
    try {
      await Promise.all(newLeads.map(lead => setDoc(doc(db, 'leads', lead.id), lead)));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },
  updateLead: async (updatedLead: Lead) => {
    const path = `leads/${updatedLead.id}`;
    try {
      await setDoc(doc(db, 'leads', updatedLead.id), updatedLead);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  // Campaigns
  subscribeCampaigns: (userId: string, businessId: string | null, callback: (campaigns: Campaign[]) => void) => {
    const path = 'campaigns';
    let q = query(collection(db, 'campaigns'), where('ownerId', '==', userId));
    if (businessId) {
      q = query(collection(db, 'campaigns'), where('ownerId', '==', userId), where('businessId', '==', businessId));
    }
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => doc.data() as Campaign));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  },
  saveCampaign: async (campaign: Campaign) => {
    const path = `campaigns/${campaign.id}`;
    try {
      await setDoc(doc(db, 'campaigns', campaign.id), campaign);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },
  updateCampaign: async (updatedCampaign: Campaign) => {
    const path = `campaigns/${updatedCampaign.id}`;
    try {
      await setDoc(doc(db, 'campaigns', updatedCampaign.id), updatedCampaign);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },
};
