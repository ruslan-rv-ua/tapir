/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Empty_State_DescriptionInputs */

const uk_empty_state_description = /** @type {(inputs: Empty_State_DescriptionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Додайте перший потік для запису.`)
};

const en_empty_state_description = /** @type {(inputs: Empty_State_DescriptionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Add your first stream to start recording.`)
};

/**
* | output |
* | --- |
* | "Add your first stream to start recording." |
*
* @param {Empty_State_DescriptionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const empty_state_description = /** @type {((inputs?: Empty_State_DescriptionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Empty_State_DescriptionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_empty_state_description(inputs)
	return en_empty_state_description(inputs)
});