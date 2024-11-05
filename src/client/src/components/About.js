import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';

import './Styling/About.css';
import leemaclogo from '../Leemac-Logo.svg';
import piece01 from '../photos/Red_Circular.JPG';
import piece02 from '../photos/Engine_Like.JPG';
import piece03 from '../photos/Grainy_Rectangle.JPG';
import piece04 from '../photos/Steel_Circular.JPG';
import piece05 from '../photos/Circle_Circles.JPG';
import piece06 from '../photos/Measuring.JPG';

function About() {
    const navigate = useNavigate()

    const requestQuoteClick = () =>{
        navigate('/request-quote')
    }

    return (
        <div className="about-container">
            <Navbar />
            <div className="about-content">
                <h3 className='bullet-points'>
                    Precision machining &#183; Prototype and Production &#183; OEM Manufacturing 
                </h3>
                <img src={leemaclogo} className="Home-logo" alt="logo" />
                <div className="text-content">
                    <h2>Our Mission</h2>
                    <p>
                    Our mission is to build lasting relationships with our clients by 
                    delivering exceptional results with every project. We are dedicated 
                    to understanding your unique needs, ensuring transparent communication 
                    from start to finish. At the core of our business is a commitment to 
                    customer satisfaction, driven by our focus on quality, precision, and 
                    efficiency. We take pride in fostering personal connections and 
                    delivering tailored solutions, making sure every client feels valued 
                    and confident in our work.
                    </p>
                    <h2>About Leemac</h2>
                    <p>
                    Founded in 2000, we unlock the precision and efficiency of CNC machining
                     for your business. Our state-of-the-art CNC machines deliver unparalleled
                      accuracy, creating complex parts with perfect consistency. We specialize 
                      in producing prototypes with quick turnaround times for companies in the 
                      semiconductor, technology, automotive, and other industries. Whether it's 
                      custom prototypes or high-volume production, we ensure every component meets 
                      the highest standards of quality. CNC machining offers faster turnaround times, 
                      cost-effectiveness, and the ability to work with a wide range of materials, 
                      including metals, plastics, and composites. Trust our expertise to bring your 
                      designs to life with flawless precision, every time.
                    </p>
                    <h2>Contact Us</h2>
                    <p>Phone: (408)-857-8984</p>
                    <p>Email: leemac@leemacmfg.com</p>
                    <p>Address: 1980 Hartog Drive, San Jose, CA, 95131</p>
                    <button className='industrial-button' onClick={requestQuoteClick}>Request Quote</button>
                </div>
                <div className="image-gallery">
                    <img src={piece01} alt="CNC Machine 1" />
                    <img src={piece02} alt="CNC Machine 3" />
                    <img src={piece03} alt="CNC Machine 2" />
                    <img src={piece04} alt="CNC Machine 4" />
                    <img src={piece05} alt="CNC Machine 5" />
                    <img src={piece06} alt="CNC Machine 6" />
                </div>
            </div>
        </div>
    )
};

export default About;