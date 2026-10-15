import React from 'react';
import { createRoot } from 'react-dom/client';
import './layout-preview.css';
import CameraPreview from './camera-preview.jsx';

const root = createRoot(document.getElementById('react-camera-preview'));
root.render(<CameraPreview />);
