/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Export_NamedInputs */

const uk_profile_export_named = /** @type {(inputs: Profile_Export_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Експортувати ${i?.name}`)
};

const en_profile_export_named = /** @type {(inputs: Profile_Export_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Export ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Export {name}" |
*
* @param {Profile_Export_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_export_named = /** @type {((inputs: Profile_Export_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Export_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_export_named(inputs)
	return en_profile_export_named(inputs)
});