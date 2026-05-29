/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Empty_State_TitleInputs */

const uk_empty_state_title = /** @type {(inputs: Empty_State_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Потоків ще немає`)
};

const en_empty_state_title = /** @type {(inputs: Empty_State_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No streams yet`)
};

/**
* | output |
* | --- |
* | "No streams yet" |
*
* @param {Empty_State_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const empty_state_title = /** @type {((inputs?: Empty_State_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Empty_State_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_empty_state_title(inputs)
	return en_empty_state_title(inputs)
});