"use client";

import Image from "next/image";
import { useState } from "react";

interface CatalogImageProps {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  className: string;
  priority?: boolean;
}

function isRemoteImage(value: string): boolean {
  return /^https?:\/\//.test(value);
}

export function CatalogImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
}: CatalogImageProps) {
  return (
    <CatalogImageInner
      key={src ?? "no-image"}
      src={src}
      alt={alt}
      sizes={sizes}
      className={className}
      priority={priority}
    />
  );
}

function CatalogImageInner({
  src,
  alt,
  sizes,
  className,
  priority = false,
}: CatalogImageProps) {
  const [loaded, setLoaded] = useState(!src);
  const [errored, setErrored] = useState(false);

  const hasRemoteSource = Boolean(src) && !errored;
  const resolvedSrc = hasRemoteSource ? src! : "/images/no_image_available.png";
  const showLoadingOverlay = hasRemoteSource && !loaded;

  return (
    <>
      {showLoadingOverlay ? (
        <Image
          src="/images/image_loading.png"
          alt=""
          aria-hidden
          fill
          sizes={sizes}
          className={`${className} catalogImageOverlay`}
        />
      ) : null}

      <Image
        src={resolvedSrc}
        alt={hasRemoteSource ? alt : `${alt} unavailable`}
        fill
        sizes={sizes}
        className={`${className} ${loaded || !hasRemoteSource ? "catalogImageReady" : "catalogImagePending"}`}
        unoptimized={hasRemoteSource ? isRemoteImage(resolvedSrc) : false}
        priority={priority}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setErrored(true);
          setLoaded(true);
        }}
      />
    </>
  );
}
