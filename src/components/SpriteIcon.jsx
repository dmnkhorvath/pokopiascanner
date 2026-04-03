import { useMemo } from 'react';
import spriteMap from '../assets/spriteMap.json';

const BASE = import.meta.env.BASE_URL || '/';

/**
 * Resolve sprite info for an item given its category and identifying data.
 *
 * @param {string} category - 'pokemon' | 'habitats' | 'items' | 'recipes'
 * @param {Object} item - The dataset item object (needs .name, optionally .number)
 * @param {Object|null} iconMap - The icon_map.json data (for items/recipes)
 * @returns {{ sheet: string, x: number, y: number, w: number, h: number } | null}
 */
function getSpriteInfo(category, item, iconMap) {
  const name = item?.name || '';
  if (!name) return null;

  if (category === 'pokemon') {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return spriteMap.pokemon?.[slug] || null;
  }

  if (category === 'habitats') {
    const num = (item.number || '').replace(/^#?0*/, '') || '000';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const paddedNum = num.padStart(3, '0');
    const key = `${slug}-${paddedNum}`;
    return spriteMap.habitats?.[key] || null;
  }

  if ((category === 'items' || category === 'recipes') && iconMap) {
    // icon_map.json maps name -> "subdir/slug.webp"
    const iconPath = iconMap[name];
    if (iconPath) {
      // Strip .webp to get sprite key: "item_ui/bean"
      const key = iconPath.replace(/\.webp$/, '');
      return spriteMap.items?.[key] || null;
    }
  }

  return null;
}

/**
 * SpriteIcon — renders an icon from a CSS sprite sheet.
 *
 * Falls back to an individual <img> if the icon isn't found in the sprite map.
 *
 * @param {Object} props
 * @param {Object} props.item - Dataset item object ({ name, number?, ... })
 * @param {string} props.category - 'pokemon' | 'habitats' | 'items' | 'recipes'
 * @param {Object|null} [props.iconMap] - icon_map.json data for items/recipes
 * @param {string|null} [props.fallbackSrc] - Individual icon URL for fallback
 * @param {string|null} [props.fallbackEmoji] - Emoji to show when no icon available
 * @param {number} [props.size=32] - Display size in CSS pixels
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.alt] - Alt text (used on fallback img)
 */
export default function SpriteIcon({
  item,
  category,
  iconMap = null,
  fallbackSrc = null,
  fallbackEmoji = null,
  size = 32,
  className = '',
  alt = '',
}) {
  const sprite = useMemo(
    () => getSpriteInfo(category, item, iconMap),
    [category, item?.name, item?.number, iconMap]
  );

  if (sprite) {
    const scale = size / sprite.w; // sprite.w is 64, display at `size`
    return (
      <div
        className={`inline-block flex-shrink-0 ${className}`}
        role="img"
        aria-label={alt || item?.name || ''}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${BASE}sprites/${sprite.sheet})`,
          backgroundPosition: `-${sprite.x * scale}px -${sprite.y * scale}px`,
          backgroundSize: `${spriteMap._meta.iconSize * 20 * scale}px auto`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'auto',
        }}
      />
    );
  }

  // Fallback to individual icon
  if (fallbackSrc) {
    return (
      <img
        src={fallbackSrc}
        alt={alt || item?.name || ''}
        className={`object-contain rounded flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }
  // Fallback to emoji
  if (fallbackEmoji) {
    return (
      <span
        className={`flex items-center justify-center text-lg flex-shrink-0 opacity-40 ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label={alt || item?.name || ''}
      >
        {fallbackEmoji}
      </span>
    );
  }

  // No icon available
  return null;
}

export { getSpriteInfo };
