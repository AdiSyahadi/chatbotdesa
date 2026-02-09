import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import Cookies from "js-cookie";
import { authApi } from "@/lib/api";
import type { User, Organization } from "@/types";

interface AuthState {
  user: User | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    fullName: string;
    organizationName: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  setUser: (user: User | null) => void;
  setOrganization: (organization: Organization | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      organization: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(email, password);
          const { user, organization, accessToken, refreshToken } = response.data;

          // Store tokens in cookies
          Cookies.set("accessToken", accessToken, { 
            expires: 1, 
            sameSite: "strict" 
          });
          Cookies.set("refreshToken", refreshToken, { 
            expires: 7, 
            sameSite: "strict" 
          });

          set({
            user,
            organization,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: unknown) {
          const message = error instanceof Error 
            ? error.message 
            : "Login failed. Please check your credentials.";
          set({ 
            error: message, 
            isLoading: false 
          });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register({
            email: data.email,
            password: data.password,
            full_name: data.fullName,
            organization_name: data.organizationName,
            phone: data.phone,
          });
          const { user, organization, accessToken, refreshToken } = response.data;

          // Store tokens in cookies
          Cookies.set("accessToken", accessToken, { 
            expires: 1, 
            sameSite: "strict" 
          });
          Cookies.set("refreshToken", refreshToken, { 
            expires: 7, 
            sameSite: "strict" 
          });

          set({
            user,
            organization,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: unknown) {
          const message = error instanceof Error 
            ? error.message 
            : "Registration failed. Please try again.";
          set({ 
            error: message, 
            isLoading: false 
          });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await authApi.logout();
        } catch {
          // Ignore logout API errors
        } finally {
          // Clear tokens
          Cookies.remove("accessToken");
          Cookies.remove("refreshToken");

          set({
            user: null,
            organization: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      fetchProfile: async () => {
        const token = Cookies.get("accessToken");
        if (!token) {
          set({ isAuthenticated: false });
          return;
        }

        set({ isLoading: true });
        try {
          const response = await authApi.getProfile();
          const { user, organization } = response.data;

          set({
            user,
            organization,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Token invalid or expired
          Cookies.remove("accessToken");
          Cookies.remove("refreshToken");

          set({
            user: null,
            organization: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setUser: (user) => set({ user }),
      setOrganization: (organization) => set({ organization }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        organization: state.organization,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selector hooks for common use cases
export const useUser = () => useAuthStore((state) => state.user);
export const useOrganization = () => useAuthStore((state) => state.organization);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
