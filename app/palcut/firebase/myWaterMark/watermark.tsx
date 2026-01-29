'use client';

import { useState, useEffect } from 'react';

export const Watermark = () => {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <div className="text-center text-slate-400 text-xs font-semibold select-none mt-8 py-4">
     Made with ❤️ in thimi • Palcut v1.0 © Anup Shrestha {year || '2024'}
    </div>
  );
};
