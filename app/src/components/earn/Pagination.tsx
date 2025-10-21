'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import Card from '@/components/ui/Card';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    className
}) => {
    if (totalPages <= 1) return null;

    const getVisiblePages = () => {
        const delta = 2;
        const range = [];
        const rangeWithDots = [];

        for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
            range.push(i);
        }

        if (currentPage - delta > 2) {
            rangeWithDots.push(1, '...');
        } else {
            rangeWithDots.push(1);
        }

        rangeWithDots.push(...range);

        if (currentPage + delta < totalPages - 1) {
            rangeWithDots.push('...', totalPages);
        } else if (totalPages > 1) {
            rangeWithDots.push(totalPages);
        }

        return rangeWithDots;
    };

    return (
        <div className={cn('flex justify-center mt-6 xs:mt-8', className)}>
            <div className="flex items-center space-x-2">
                <Card
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={cn("px-2 xs:px-3 py-1 xs:py-2 text-xs xs:text-sm font-mono", !(currentPage === 1) && "cursor-pointer")}
                >
                    <span className="hidden xs:inline">Previous</span>
                    <span className="xs:hidden">Prev</span>
                </Card>

                {getVisiblePages().map((page, index) => (
                    <React.Fragment key={index}>
                        {page === '...' ? (
                            <span className="px-2 xs:px-3 py-1 xs:py-2 text-xs xs:text-sm font-mono">...</span>
                        ) : (
                            <Card
                                onClick={() => onPageChange(page as number)}
                                isActive={currentPage === page}
                                className={cn("px-2 xs:px-3 py-1 xs:py-2 text-xs xs:text-sm font-mono", !(currentPage === page) && "cursor-pointer")}
                            >
                                {page}
                            </Card>
                        )}
                    </React.Fragment>
                ))}

                <Card
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={cn("px-2 xs:px-3 py-1 xs:py-2 text-xs xs:text-sm font-mono", !(currentPage === totalPages) && "cursor-pointer")}
                >
                    Next
                </Card>
            </div>
        </div>
    );
};

export default Pagination;
