import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { setActiveHubDb, queryClient } from "@/lib/queryClient";

export interface SuperHub {
  id: string;
  name: string;
  location: string | null;
  imageUrl: string | null;
}

export interface PincodeEntry {
  pincode: string;
  charge: number;
  timeDelay: number;
}

export interface SubHub {
  id: string;
  superHubId: string | null;
  name: string;
  location: string | null;
  imageUrl: string | null;
  dbName: string;
  pincodes: PincodeEntry[];
}

interface HubContextValue {
  selectedSuperHub: SuperHub | null;
  selectedSubHub: SubHub | null;
  setHub: (superHub: SuperHub, subHub: SubHub) => void;
  clearHub: () => void;
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

const HubContext = createContext<HubContextValue>({
  selectedSuperHub: null,
  selectedSubHub: null,
  setHub: () => {},
  clearHub: () => {},
  isPickerOpen: false,
  openPicker: () => {},
  closePicker: () => {},
});

const STORAGE_KEY = "fishtokri_hub";

const DEFAULT_SUPER_HUB_NAME = "Mumbai";
const DEFAULT_SUB_HUB_NAME = "Thane";

async function fetchDefaultHub(): Promise<{ superHub: SuperHub; subHub: SubHub } | null> {
  try {
    const superRes = await fetch("/api/hubs/super");
    if (!superRes.ok) return null;
    const superHubs: SuperHub[] = await superRes.json();
    const superHub = superHubs.find((h) => h.name === DEFAULT_SUPER_HUB_NAME) ?? superHubs[0];
    if (!superHub) return null;

    const subRes = await fetch(`/api/hubs/sub?superHubId=${superHub.id}`);
    if (!subRes.ok) return null;
    const subHubs: SubHub[] = await subRes.json();
    const subHub = subHubs.find((h) => h.name === DEFAULT_SUB_HUB_NAME) ?? subHubs[0];
    if (!subHub) return null;

    return { superHub, subHub };
  } catch {
    return null;
  }
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [selectedSuperHub, setSelectedSuperHub] = useState<SuperHub | null>(null);
  const [selectedSubHub, setSelectedSubHub] = useState<SubHub | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const { superHub, subHub } = JSON.parse(saved);
          setSelectedSuperHub(superHub);
          setSelectedSubHub(subHub);
          setActiveHubDb(subHub.dbName);
          return;
        }
      } catch {}

      const defaults = await fetchDefaultHub();
      if (defaults) {
        const { superHub, subHub } = defaults;
        setSelectedSuperHub(superHub);
        setSelectedSubHub(subHub);
        setActiveHubDb(subHub.dbName);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ superHub, subHub }));
        queryClient.invalidateQueries();
      }
    };

    init();
  }, []);

  const setHub = useCallback((superHub: SuperHub, subHub: SubHub) => {
    setSelectedSuperHub(superHub);
    setSelectedSubHub(subHub);
    setActiveHubDb(subHub.dbName);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ superHub, subHub }));
    queryClient.invalidateQueries();
    setIsPickerOpen(false);
  }, []);

  const clearHub = useCallback(() => {
    setSelectedSuperHub(null);
    setSelectedSubHub(null);
    setActiveHubDb(null);
    localStorage.removeItem(STORAGE_KEY);
    queryClient.invalidateQueries();
  }, []);

  return (
    <HubContext.Provider value={{
      selectedSuperHub, selectedSubHub, setHub, clearHub,
      isPickerOpen, openPicker: () => setIsPickerOpen(true), closePicker: () => setIsPickerOpen(false),
    }}>
      {children}
    </HubContext.Provider>
  );
}

export function useHub() {
  return useContext(HubContext);
}
