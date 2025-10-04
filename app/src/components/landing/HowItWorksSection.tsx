import React from 'react';
import Image from 'next/image';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface StepCardProps {
    stepNumber: string;
    title: string;
    description: string;
    icon: React.ReactNode;
}

const StepCard: React.FC<StepCardProps> = ({ stepNumber, title, description, icon }) => {
    return (
        <Card className="text-left space-y-11">
            <div className="space-y-1">
            <div className="text-sm font-mono text-gray-500">{stepNumber}</div>
            <h3 className="font-mono font-medium text-xl text-gray-800">{title}</h3>
            </div>
            <div className="w-16 h-16 flex items-center justify-center">
                {icon}
            </div>
            <p className="font-mono text-sm text-gray-700">{description}</p>
        </Card>
    );
};

interface HowItWorksSectionProps {
    className?: string;
}

const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({ className }) => {
    const steps = [
        {
            stepNumber: 'Step 1',
            title: 'Deposit Native BTC',
            description: 'Send BTC directly from your wallet (L1 or Lightning).',
            icon: (
                <Image src="/icons/deposit.svg" alt="Deposit" width={56} height={56} />
            )
        },
        {
            stepNumber: 'Step 2',
            title: 'One-Click Bridge',
            description: 'We handle the conversion into Starknet-compatible WBTC behind the scenes.',
            icon: (
                <Image src="/icons/bridge.svg" alt="Bridge" width={56} height={56} />
            )
        },
        {
            stepNumber: 'Step 3',
            title: 'Automatic Yield',
            description: 'Your BTC is deployed into trusted Starknet protocols like Troves, Endur, or Vesu.',
            icon: (
                <Image src="/icons/yield.svg" alt="Yield" width={56} height={56} />
            )
        },
        {
            stepNumber: 'Step 4',
            title: 'Withdraw Anytime',
            description: 'Easy withdraw your yields earned!',
            icon: (
                <Image src="/icons/withdraw.svg" alt="Withdraw" width={56} height={56} />
            )
        }
    ];

    return (
        <section className={cn('w-full px-4 sm:px-6 lg:px-8 py-12 md:py-20', className)}>
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {steps.map((step, index) => (
                        <StepCard
                            key={index}
                            stepNumber={step.stepNumber}
                            title={step.title}
                            description={step.description}
                            icon={step.icon}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default HowItWorksSection;