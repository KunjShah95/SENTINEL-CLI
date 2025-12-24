import React, { useState } from 'react';
import { Twitter, Linkedin, Link2, Check } from 'lucide-react';
import { Button } from './ui/button';

export function Showcase() {
    const [copied, setCopied] = useState(false);

    const handleShare = (platform: string) => {
        // Sharing the current page URL, assuming the showcase image is relevant to the page content.
        // Ideally, for specific image sharing, we'd need server-side OG tag generation.
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent("Check out this automated security analysis by Sentinel CLI! 🛡️");

        let shareUrl = '';
        if (platform === 'twitter') {
            shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        } else if (platform === 'linkedin') {
            shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
        }

        if (shareUrl) {
            window.open(shareUrl, '_blank', 'width=600,height=400');
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <section className="py-24 px-6 relative overflow-hidden bg-gray-950">
            {/* Background gradients */}
            <div className="absolute inset-0 bg-emerald-900/5 -z-10" />

            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row gap-16 items-center">

                    {/* Image Showcase */}
                    <div className="w-full lg:w-2/3 relative group">
                        {/* Glow effect */}
                        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur-lg opacity-75 group-hover:opacity-100 transition duration-1000"></div>

                        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-gray-900/50 backdrop-blur-sm">
                            <img
                                // Since we moved the file to public/assets/showcase.png
                                src="/assets/showcase.png"
                                alt="Sentinel Security Analysis"
                                className="w-full h-auto transform transition-transform duration-700 hover:scale-[1.01]"
                            />

                            {/* Overlay on hover */}
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-8">
                                <p className="text-white font-medium text-lg">Automated Security Report Preview</p>
                            </div>
                        </div>
                    </div>

                    {/* Share Actions */}
                    <div className="w-full lg:w-1/3 space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                                Showcase your <span className="text-emerald-400">Security Score</span>
                            </h2>
                            <p className="text-gray-400 text-lg leading-relaxed">
                                Demonstrate your commitment to security. Share your automated analysis reports directly with your community and stakeholders.
                            </p>
                        </div>

                        <div className="space-y-4 pt-4">
                            <Button
                                onClick={() => handleShare('twitter')}
                                className="w-full h-14 text-lg gap-3 bg-[#1DA1F2] hover:bg-[#1DA1F2]/90 text-white border-none shadow-lg shadow-[#1DA1F2]/20"
                            >
                                <Twitter className="w-5 h-5" />
                                Share on Twitter
                            </Button>

                            <Button
                                onClick={() => handleShare('linkedin')}
                                className="w-full h-14 text-lg gap-3 bg-[#0077b5] hover:bg-[#0077b5]/90 text-white border-none shadow-lg shadow-[#0077b5]/20"
                            >
                                <Linkedin className="w-5 h-5" />
                                Share on LinkedIn
                            </Button>

                            <div className="pt-2">
                                <Button
                                    onClick={handleCopyLink}
                                    variant="outline"
                                    className="w-full h-14 text-lg gap-3 border-gray-700 hover:bg-gray-800 text-white hover:text-white"
                                >
                                    {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Link2 className="w-5 h-5" />}
                                    {copied ? "Link Copied" : "Copy Link"}
                                </Button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
}
