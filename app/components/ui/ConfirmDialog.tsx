"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ConfirmDialogProps {
    isOpen: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    isOpen,
    title = "Confirm Action",
    message,
    confirmText = "Yes",
    cancelText = "No",
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === backdropRef.current) {
            onCancel();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div
                    ref={backdropRef}
                    onClick={handleBackdropClick}
                    className="
    fixed inset-0 z-[999]
    flex items-center justify-center
    bg-black/60 backdrop-blur-sm
    px-4 sm:px-6
  "
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 32 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 32 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="
      w-full max-w-md
      bg-white dark:bg-slate-800
      border border-slate-200 dark:border-slate-700
      overflow-hidden
      p-3
    "
                    >
                        {/* Header */}
                        <div className=" pb-4 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                                {title}
                            </h3>
                        </div>

                        {/* Body */}
                        <div className="">
                            <p className="text-base p-4 t-5 leading-relaxed text-slate-700 dark:text-slate-300">
                                {message}
                            </p>
                        </div>

                        {/* Footer */}
                        <div
                            className="
                px-8 pb-8 pt-6
                border-t border-slate-200 dark:border-slate-700
                flex flex-col sm:flex-row
                gap-4 sm:gap-6
                justify-end
              "
                        >
                            <button
                                onClick={onCancel}
                                className="
                  sm:w-auto
                  px-6 py-3 rounded-xl
                  font-medium
                  text-slate-700 dark:text-slate-300
                  bg-slate-100 dark:bg-slate-700
                  hover:bg-slate-200 dark:hover:bg-slate-600
                  transition-all duration-200
                  active:scale-95
                "
                            >
                                {cancelText}
                            </button>

                            <button
                                onClick={onConfirm}
                                className="
                 sm:w-auto
                  px-6 py-3 rounded-xl
                  font-medium text-white
                  bg-indigo-600 hover:bg-indigo-700
                  shadow-md hover:shadow-lg
                  transition-all duration-200
                  active:scale-95
                "
                            >
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
