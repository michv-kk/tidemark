import React, { Suspense } from 'react';
import WalletsContent from './WalletsContent';

export default function WalletsPage() {
  return (
    <Suspense fallback={<div className="page-container"><div className="text-gray-500">Loading...</div></div>}>
      <WalletsContent />
    </Suspense>
  );
}
