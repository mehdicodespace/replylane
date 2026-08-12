"use client";
import { useEffect, useMemo, useState, createContext, useContext } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onAuthStateChanged, type User } from "firebase/auth";
import { clientAuth, firebaseConfigured } from "@/lib/firebase-client";
import { useUI, useDemo } from "@/lib/store";

const AuthContext = createContext<{ user: User | null; loading: boolean }>({
  user: null,
  loading: true,
});
export const useAuth = () => useContext(AuthContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 20000, retry: 1 } } }),
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mode = useUI((s) => s.theme);
  useEffect(() => {
    void useUI.persist.rehydrate();
    void useDemo.persist.rehydrate();
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(clientAuth(), (next) => {
      setUser(next);
      setLoading(false);
      queryClient.clear();
    });
  }, [queryClient]);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: mode === "dark" ? "#aeb8ff" : "#5366d8",
            contrastText: mode === "dark" ? "#111c35" : "#fff",
          },
          background: {
            default: mode === "dark" ? "#13151a" : "#f4f5f7",
            paper: mode === "dark" ? "#1c1f25" : "#fff",
          },
          text: {
            primary: mode === "dark" ? "#f0f1f4" : "#23262d",
            secondary: mode === "dark" ? "#a2a7b1" : "#707784",
          },
          divider: mode === "dark" ? "#30394b" : "#e0e5ef",
        },
        typography: {
          fontFamily: '"DM Sans Variable", "Vazirmatn Variable", sans-serif',
          button: { textTransform: "none", fontWeight: 600 },
        },
        shape: { borderRadius: 12 },
        components: {
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: { root: { padding: "11px 20px", borderRadius: 9 } },
          },
          MuiDialog: { styleOverrides: { paper: { borderRadius: 18, backgroundImage: "none" } } },
        },
      }),
    [mode],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
