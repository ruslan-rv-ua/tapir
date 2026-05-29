/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Action_PlayInputs */

const uk_songs_action_play = /** @type {(inputs: Songs_Action_PlayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Грати`)
};

const en_songs_action_play = /** @type {(inputs: Songs_Action_PlayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Play`)
};

/**
* | output |
* | --- |
* | "Play" |
*
* @param {Songs_Action_PlayInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_action_play = /** @type {((inputs?: Songs_Action_PlayInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Action_PlayInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_action_play(inputs)
	return en_songs_action_play(inputs)
});