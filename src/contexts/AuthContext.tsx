import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileChecked: boolean;
  hasProfileName: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profileChecked: false,
  hasProfileName: false,
  signOut: async () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileChecked, setProfileChecked] = useState(false);
  const [hasProfileName, setHasProfileName] = useState(false);

  const getSuggestedDisplayName = (authUser: User) => {
    const fromProfileMetadata = authUser.user_metadata?.full_name as string | undefined;
    if (fromProfileMetadata && fromProfileMetadata.trim()) return fromProfileMetadata.trim();

    const fromName = authUser.user_metadata?.name as string | undefined;
    if (fromName && fromName.trim()) return fromName.trim();

    if (authUser.email) return authUser.email.split("@")[0];

    return "";
  };

  const syncProfileNameState = useCallback(async (authUser: User | null) => {
    if (!authUser) {
      setProfileChecked(true);
      setHasProfileName(false);
      return;
    }

    setProfileChecked(false);

    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", authUser.id)
      .maybeSingle();

    const currentName = profileData?.display_name?.trim() || "";
    if (currentName) {
      setHasProfileName(true);
      setProfileChecked(true);
      return;
    }

    const suggestedName = getSuggestedDisplayName(authUser);

    if (!suggestedName) {
      setHasProfileName(false);
      setProfileChecked(true);
      return;
    }

    await supabase.from("user_profiles").upsert(
      {
        user_id: authUser.id,
        display_name: suggestedName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    setHasProfileName(true);
    setProfileChecked(true);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        void syncProfileNameState(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      void syncProfileNameState(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [syncProfileNameState]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profileChecked, hasProfileName, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
