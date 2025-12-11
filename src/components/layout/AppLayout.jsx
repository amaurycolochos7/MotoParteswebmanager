import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import MobileNav from './MobileNav';

export default function AppLayout() {
    return (
        <>
            <TopBar />
            <main className="page" style={{ paddingTop: '60px' }}>
                <Outlet />
            </main>
            <MobileNav />
        </>
    );
}
