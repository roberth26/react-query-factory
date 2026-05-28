import { createContext, useContext, useState } from 'react';
import type { FlashbarProps } from '@cloudscape-design/components';

type Notification = FlashbarProps.MessageDefinition & { id: string };

interface NotificationContextValue {
	notifications: Notification[];
	addNotification: (n: Omit<Notification, 'dismissible' | 'onDismiss'>) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
	notifications: [],
	addNotification: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
	const [notifications, setNotifications] = useState<Notification[]>([]);

	function addNotification(n: Omit<Notification, 'dismissible' | 'onDismiss'>) {
		setNotifications(prev => [
			...prev,
			{
				...n,
				dismissible: true,
				onDismiss: () =>
					setNotifications(ns => ns.filter(item => item.id !== n.id)),
			},
		]);
	}

	return (
		<NotificationContext.Provider value={{ notifications, addNotification }}>
			{children}
		</NotificationContext.Provider>
	);
}

export function useNotifications() {
	return useContext(NotificationContext);
}
