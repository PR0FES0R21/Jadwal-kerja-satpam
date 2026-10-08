import {createRoot} from 'react-dom/client';
import Page from '../app/page';
import '../app/globals.css';
import {PwaControls} from '../components/pwa-controls';
createRoot(document.getElementById('root')!).render(<><PwaControls/><Page/></>);
