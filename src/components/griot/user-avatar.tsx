/**
 * User Avatar & Profile Helpers
 * Computes monogram initials, avatar gradient or image url cleanly for the user.
 */

import React from "react";

export function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const clean = name.trim();
    if (clean.toLowerCase() !== "griot" && clean.toLowerCase() !== "utilizador") {
      const parts = clean.split(/\s+/);
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return clean.substring(0, 2).toUpperCase();
    }
  }

  if (email && email.trim()) {
    const localPart = email.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") || "";
    if (localPart) {
      return localPart.substring(0, 2).toUpperCase();
    }
  }

  if (name && name.trim()) {
    return name.trim().substring(0, 2).toUpperCase();
  }

  return "U";
}

export function UserAvatar({
  name,
  email,
  avatarUrl,
  size = "md",
  className = "",
}: {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const [imgError, setImgError] = React.useState(false);
  const initials = getInitials(name, email);

  const sizeClasses = {
    sm: "size-8 text-[12px] rounded-xl",
    md: "size-10 text-[14px] rounded-xl",
    lg: "size-12 text-[16px] rounded-2xl",
    xl: "size-14 text-[18px] rounded-2xl",
  };

  // Reseta erro se avatarUrl mudar
  React.useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name || "Avatar"}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImgError(true)}
        className={`${sizeClasses[size]} object-cover border border-hairline shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} shrink-0 flex items-center justify-center font-semibold tracking-tight bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 text-zinc-100 border border-hairline shadow-sm select-none ${className}`}
    >
      {initials}
    </div>
  );
}
