import leemaclogo from '../Leemac-Logo.svg';
import './Styling/Home.css';
import Navbar from './Navbar';
import {useNavigate} from 'react-router-dom'

function Home() {
  const navigate = useNavigate();
  const goToAbout= () =>{
    navigate('/about')
  }

  return (
    <div className="Home">
      <header className="Home-header">
        <Navbar />
        <div className='center'>
          <img src={leemaclogo} className="Home-logo" alt="logo" />
          <button className="industrial-button" onClick={goToAbout}>About</button>
        </div>
      </header>
    </div>
  );
}

export default Home;
