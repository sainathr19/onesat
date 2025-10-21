"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface AssetSupportNoticeProps {
    className?: string;
}

const AssetSupportNotice: React.FC<AssetSupportNoticeProps> = ({ className }) => {
    const [isDismissed, setIsDismissed] = useState(false);

    if (isDismissed) return null;

    return (
        <div className={cn(
            "bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 p-4 max-w-7xl mx-auto sm:p-6 lg:p-8",
            className
        )}>
            <div className="flex items-start">
                <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-blue-800">
                            Asset Support Notice
                        </h3>
                        <button
                            onClick={() => setIsDismissed(true)}
                            className="text-blue-400 hover:text-blue-600 transition-colors"
                            aria-label="Dismiss notice"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="mt-2 text-sm text-blue-700">
                        <p>
                            <strong>Note:</strong> We currently support only <strong>WBTC</strong> swaps because Atomiq only supports WBTC for Vesu pool contracts. Other assets are available in Vesu pools but are not supported by Atomiq for Bitcoin-to-Starknet conversions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AssetSupportNotice;
