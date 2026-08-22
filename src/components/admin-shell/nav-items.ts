import {
  ChartBar,
  ChatCircleDots,
  GearSix,
  Megaphone,
  Package,
  Robot,
  Tag,
  User,
  UsersThree,
  SquaresFour,
  type Icon,
} from "@phosphor-icons/react";

export type NavItem = {
  href: string;
  icon: Icon;
  label: string;
};

export const navItems: NavItem[] = [
  { href: "/", icon: SquaresFour, label: "Overview" },
  { href: "/community", icon: UsersThree, label: "Community" },
  { href: "/members", icon: User, label: "Members" },
  { href: "/leads", icon: ChatCircleDots, label: "Leads" },
  { href: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { href: "/offers", icon: Tag, label: "Offers" },
  { href: "/content", icon: Package, label: "Content" },
  { href: "/automations", icon: Robot, label: "Bot & Automations" },
  { href: "/analytics", icon: ChartBar, label: "Analytics" },
  { href: "/settings", icon: GearSix, label: "Settings" },
];
