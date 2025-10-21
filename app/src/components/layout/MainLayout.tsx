import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import AssetSupportNotice from '@/components/ui/AssetSupportNotice';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
    children: React.ReactNode;
    className?: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, className }) => {
    return (
        <div className={cn('min-h-screen flex flex-col bg-[#F8F7F5]', className)}>
            <Navbar className="relative z-10 pb-8 md:pb-12" />
            <AssetSupportNotice className="mb-6" />
            <main className="flex-1 relative z-0">
                {children}
            </main>
            <Footer />
        </div>
    );
};

export default MainLayout;
