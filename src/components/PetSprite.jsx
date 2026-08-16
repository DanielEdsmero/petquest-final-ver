import { useState, useEffect } from 'react'
import { spriteFor, petMeta } from '../config/pets'

/*
 * Renders the evolution sprite for a companion. Pixel art is displayed with
 * `image-rendering: pixelated`; Elder/Legendary art is tall so it uses
 * object-fit: contain. If the PNG is missing (assets not yet dropped into
 * /public/pets/), we fall back to the pet's emoji rather than a broken image.
 */
export default function PetSprite({ petId, level = 1, size = 120, className = '', style = {} }) {
  const src = spriteFor(petId, level)
  const [failed, setFailed] = useState(false)

  // Retry the real art whenever the pet or its stage changes.
  useEffect(() => { setFailed(false) }, [src])

  if (failed) {
    return (
      <span className={className} aria-label={petMeta(petId).species}
        style={{ fontSize: size * 0.7, lineHeight: 1, display: 'inline-block', ...style }}>
        {petMeta(petId).emoji}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={petMeta(petId).species}
      onError={() => setFailed(true)}
      className={className}
      style={{
        width: size, height: size,
        objectFit: level >= 4 ? 'contain' : 'contain',
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  )
}
