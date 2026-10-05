import { NavLink } from "react-router-dom";
import { Home, Users, History, User, BookOpen } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const items = [
  { to: "/dashboard", key: "nav.home", icon: Home },
  { to: "/contacts", key: "nav.contacts", icon: Users },
  { to: "/history", key: "nav.history", icon: History },
  { to: "/safety-tips", key: "nav.tips", icon: BookOpen },
  { to: "/profile", key: "nav.profile", icon: User },
];

export const BottomNav = () => {
  const { t } = useLanguage();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border">
      <div className="container max-w-md grid grid-cols-5">
        {items.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <Icon className="w-5 h-5 mb-0.5" />
            {t(key)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
