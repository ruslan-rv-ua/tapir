/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Action_MenuInputs */

const uk_songs_action_menu = /** @type {(inputs: Songs_Action_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дії`)
};

const en_songs_action_menu = /** @type {(inputs: Songs_Action_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Actions`)
};

/**
* | output |
* | --- |
* | "Actions" |
*
* @param {Songs_Action_MenuInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_action_menu = /** @type {((inputs?: Songs_Action_MenuInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Action_MenuInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_action_menu(inputs)
	return en_songs_action_menu(inputs)
});