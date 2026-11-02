import React, { act } from 'react';
import { render } from '../../testUtils/render';
import UserGuide from './UserGuide';
import { guides } from './guide/guideContent';

global.IS_REACT_ACT_ENVIRONMENT = true;

let view;
let observers;
let scrolled;

beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this); };
  observers = [];
  global.IntersectionObserver = jest.fn((callback) => {
    const observer = { callback, observe: jest.fn(), disconnect: jest.fn() };
    observers.push(observer);
    return observer;
  });
});

afterEach(() => {
  view.unmount();
  delete global.IntersectionObserver;
});

const mount = () => {
  view = render(<UserGuide />, { path: '/client-guide' });
  return view.container;
};
const contentsLinks = (c) => [...c.querySelectorAll('nav[aria-label="Guide contents"] a')];
const current = (c) => contentsLinks(c).filter((a) => a.getAttribute('aria-current')).map((a) => a.textContent);

describe('UserGuide', () => {
  it('titles the page and shows one h2 per guide with a contents link for each', () => {
    const c = mount();
    expect(c.querySelector('h1').textContent).toBe('User Guide');
    expect(c.querySelectorAll('h2')).toHaveLength(17);
    expect(contentsLinks(c).map((a) => a.textContent)).toEqual(guides.map((g) => g.title));
    expect(c.querySelector(`section#${guides[0].id} h2`).textContent).toBe(guides[0].title);
  });

  it('scrolls a guide into view and marks its link current when clicked', () => {
    const c = mount();
    const target = guides[4];
    const link = contentsLinks(c)[4];
    act(() => link.click());
    const section = c.querySelector(`section#${target.id}`);
    expect(scrolled).toEqual([section]);
    expect(current(c)).toEqual([target.title]);
  });

  it('moves the current link to the guide the observer reports in view', () => {
    const c = mount();
    const section = c.querySelector(`section#${guides[7].id}`);
    act(() => observers[0].callback([{ isIntersecting: true, target: section }]));
    expect(current(c)).toEqual([guides[7].title]);
    act(() => observers[0].callback([{ isIntersecting: false, target: c.querySelector(`section#${guides[2].id}`) }]));
    expect(current(c)).toEqual([guides[7].title]);
  });

  it('observes every guide section and disconnects on unmount', () => {
    mount();
    expect(observers[0].observe).toHaveBeenCalledTimes(17);
    view.unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
    view = render(<div />);
  });

  it('still renders and scrolls when IntersectionObserver is undefined', () => {
    delete global.IntersectionObserver;
    const c = mount();
    act(() => contentsLinks(c)[1].click());
    expect(current(c)).toEqual([guides[1].title]);
  });

  it('puts the contents in a collapsed details on phones', () => {
    const c = mount();
    const details = c.querySelector('details');
    expect(details.open).toBe(false);
    expect(details.querySelector('nav[aria-label="Guide contents"]')).not.toBeNull();
  });
});
