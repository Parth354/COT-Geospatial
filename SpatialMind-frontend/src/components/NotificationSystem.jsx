import React, { useEffect, useState } from 'react';
import {
    X,
    CheckCircle,
    AlertTriangle as WarningIcon,
    Info,
    Wifi,
    WifiOff,
    Upload,
    Download,
    MapPin,
    Database,
    AlertCircle as ErrorIcon
} from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';

// --- Icon Mapping ---
const IconMap = {
    success: CheckCircle,
    warning: WarningIcon,
    error: ErrorIcon,
    info: Info,
    connection: Wifi,
    upload: Upload,
    download: Download,
    geospatial: MapPin,
    dataset: Database,
};

const getIcon = (type, category) => {
    const Icon = category ? (IconMap[category] || Info) : (IconMap[type] || Info);
    const colorClasses = {
        success: 'text-green-500',
        warning: 'text-yellow-500',
        error: 'text-red-500',
        info: 'text-blue-500',
        connection: type === 'success' ? 'text-green-500' : 'text-red-500'
    };
    const finalColor = colorClasses[category === 'connection' ? 'connection' : type] || 'text-gray-500';

    if (category === 'connection' && type === 'error') {
        return <WifiOff className={`h-5 w-5 ${finalColor}`} />;
    }

    return <Icon className={`h-5 w-5 ${finalColor}`} />;
};

const getStyles = (type) => {
    const base = 'transition-all duration-500 transform border rounded-lg p-4 shadow-xl flex items-start space-x-3 w-full max-w-sm';
    switch (type) {
        case 'success': return `${base} bg-green-50 border-green-200`;
        case 'warning': return `${base} bg-yellow-50 border-yellow-200`;
        case 'error': return `${base} bg-red-50 border-red-200`;
        default: return `${base} bg-blue-50 border-blue-200`;
    }
};

const Notification = ({ notification, onDismiss }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        if (notification.timeout) {
            const timer = setTimeout(() => {
                setIsExiting(true);
                setTimeout(() => onDismiss(notification.id), 400);
            }, notification.timeout);
            return () => clearTimeout(timer);
        }
    }, [notification, onDismiss]);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(() => onDismiss(notification.id), 400);
    };

    const animationClass = isExiting ? 'animate-slideOutRight' : 'animate-slideInRight';

    return (
        <div
            className={`${animationClass} ${getStyles(notification.type)}`}
            role="alert"
            aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
        >
            <div className="flex-shrink-0 pt-0.5">
                {getIcon(notification.type, notification.category)}
            </div>
            <div className="flex-1 min-w-0">
                {notification.title && (
                    <h4 className="font-semibold text-gray-800 text-sm mb-1">{notification.title}</h4>
                )}
                <p className="text-sm text-gray-700 leading-relaxed">{notification.message}</p>
                {notification.details && (
                    <pre className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded overflow-x-auto">
                        {notification.details}
                    </pre>
                )}
            </div>
            <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 -m-1 rounded-full text-gray-400 hover:bg-gray-200"
                aria-label="Dismiss notification"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};

function NotificationSystem() {
    const { state, actions } = useAppContext();

    if (!state.notifications || state.notifications.length === 0) {
        return null;
    }

    const sortedNotifications = [...state.notifications].sort((a, b) => {
        const priority = { error: 3, warning: 2, info: 1, success: 0 };
        return (priority[b.type] || 0) - (priority[a.type] || 0);
    });

    return (
        <div className="fixed top-4 right-4 z-[9999] space-y-3">
            {sortedNotifications.map((notification) => (
                <Notification
                    key={notification.id}
                    notification={notification}
                    onDismiss={actions.removeNotification}
                />
            ))}

            {/* Embedded Animations */}
            <style>
                {`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideOutRight {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100%); }
                }
                .animate-slideInRight {
                    animation: slideInRight 0.4s ease-out forwards;
                }
                .animate-slideOutRight {
                    animation: slideOutRight 0.4s ease-in forwards;
                }
                `}
            </style>
        </div>
    );
}

export default NotificationSystem;
