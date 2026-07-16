import { useState } from 'react';
import { initials, nameColor } from '../lib/avatar';

export function Avatar({
  name,
  photoUrl,
  size = 40,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const px = `${size}px`;
  if (photoUrl && !broken) {
    return (
      <img
        src={photoUrl}
        alt={`Foto de ${name}`}
        onError={() => setBroken(true)}
        className="rounded-full object-cover"
        style={{ width: px, height: px, minWidth: px }}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`Avatar de ${name}`}
      className="flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: px,
        height: px,
        minWidth: px,
        backgroundColor: nameColor(name),
        fontSize: size * 0.38,
      }}
    >
      {initials(name)}
    </div>
  );
}
