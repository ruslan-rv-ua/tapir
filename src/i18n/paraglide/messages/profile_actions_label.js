/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Actions_LabelInputs */

const uk_profile_actions_label = /** @type {(inputs: Profile_Actions_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дії профілю`)
};

const en_profile_actions_label = /** @type {(inputs: Profile_Actions_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profile actions`)
};

/**
* | output |
* | --- |
* | "Profile actions" |
*
* @param {Profile_Actions_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_actions_label = /** @type {((inputs?: Profile_Actions_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Actions_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_actions_label(inputs)
	return en_profile_actions_label(inputs)
});