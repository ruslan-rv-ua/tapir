/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Skip_First_IncompleteInputs */

const uk_settings_skip_first_incomplete = /** @type {(inputs: Settings_Skip_First_IncompleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пропускати перший неповний трек`)
};

const en_settings_skip_first_incomplete = /** @type {(inputs: Settings_Skip_First_IncompleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Skip first incomplete track`)
};

/**
* | output |
* | --- |
* | "Skip first incomplete track" |
*
* @param {Settings_Skip_First_IncompleteInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_skip_first_incomplete = /** @type {((inputs?: Settings_Skip_First_IncompleteInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Skip_First_IncompleteInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_skip_first_incomplete(inputs)
	return en_settings_skip_first_incomplete(inputs)
});